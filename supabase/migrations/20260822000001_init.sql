-- =============================================================================
-- LA CANTERA GLOBAL — esquema inicial
-- =============================================================================
-- Decisión de diseño (términos de Google Maps Platform):
--   places_cache / search_corpus  = contenido de Google. TTL 30 días, se purga.
--   leads                          = propiedad del alumno. No expira nunca.
--                                    Solo retiene el mínimo necesario para que
--                                    el CRM siga siendo usable (nombre, ciudad,
--                                    place_id) más TODO lo derivado de la web
--                                    propia del negocio y de nuestro análisis.
--   rating / reviews / dirección   = NUNCA se copian a leads. Viven solo en
--                                    places_cache y caducan con él.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Configuración global y perfiles
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id            boolean primary key default true check (id),
  default_limits jsonb not null default jsonb_build_object(
    'searches_per_day',        3,
    'businesses_per_search',   50,
    'ai_analyses_per_day',     150,
    'quality_generations_per_day', 10,
    'enrichments_per_day',     5
  ),
  updated_at    timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'student' check (role in ('student','admin')),
  limits     jsonb not null default '{}'::jsonb,   -- override por alumno
  created_at timestamptz not null default now()
);

-- Acceso por invitación. Sin esto, cualquiera que encuentre el dominio
-- consume tu presupuesto de APIs.
create table public.invites (
  email      text primary key,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_first boolean;
  v_invited  boolean;
begin
  select count(*) = 0 into v_is_first from public.profiles;
  select exists(select 1 from public.invites where email = lower(new.email) and used_at is null)
    into v_invited;

  if not v_is_first and not v_invited then
    raise exception 'NOT_INVITED' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, lower(new.email), case when v_is_first then 'admin' else 'student' end);

  update public.invites set used_at = now() where email = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- -----------------------------------------------------------------------------
-- 2. Cuotas atómicas
-- -----------------------------------------------------------------------------
create table public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  kind    text not null,
  used    integer not null default 0,
  primary key (user_id, day, kind)
);

create or replace function public.get_limit(p_user_id uuid, p_kind text)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (p.limits    ->> p_kind)::int,
    (s.default_limits ->> p_kind)::int,
    0
  )
  from public.profiles p
  cross join public.app_settings s
  where p.id = p_user_id;
$$;

-- Se llama ANTES de cada operación pagada. Si excede, lanza excepción y el
-- incremento se revierte con la transacción. No hay carrera posible.
create or replace function public.consume_quota(p_user_id uuid, p_kind text, p_n integer default 1)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit int;
  v_used  int;
begin
  v_limit := public.get_limit(p_user_id, p_kind);

  insert into public.usage_counters (user_id, day, kind, used)
  values (p_user_id, current_date, p_kind, p_n)
  on conflict (user_id, day, kind)
    do update set used = public.usage_counters.used + p_n
  returning used into v_used;

  if v_used > v_limit then
    raise exception 'QUOTA_EXCEEDED:%:%:%', p_kind, v_used - p_n, v_limit
      using errcode = 'P0001';
  end if;

  return v_limit - v_used;   -- cuánto queda
end;
$$;

create table public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,            -- places_call | ai_bulk | ai_quality | enrichment
  units      integer not null default 1,
  cost_usd   numeric(10,6) not null default 0,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.usage_events (created_at desc);
create index on public.usage_events (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. Oferta y búsquedas
-- -----------------------------------------------------------------------------
create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text,
  what_i_sell    text not null,
  problem_solved text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.offers (user_id);

create table public.searches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  offer_id        uuid references public.offers(id) on delete set null,
  niche           text not null,
  country         text not null,
  city            text not null,
  language        text not null default 'es' check (language in ('es','en')),
  target_count    integer not null default 50 check (target_count in (25,50,100)),
  mode            text not null default 'live' check (mode in ('live','demo')),
  status          text not null default 'pending'
                  check (status in ('pending','discovering','filtering','extracting','qualifying','done','failed')),
  stage_cursor    jsonb not null default '{}'::jsonb,   -- permite reanudar tras cortar el stream
  found_count     integer not null default 0,
  candidate_count integer not null default 0,
  qualified_count integer not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.searches (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. Caché de Google (efímero — TTL 30 días)
-- -----------------------------------------------------------------------------
-- Repetir la misma consulta dentro de la ventana no cuesta nada. Es la palanca
-- de ahorro más grande cuando 30 alumnos prospectan nichos parecidos.
create table public.search_corpus (
  query_key  text primary key,              -- niche|city|country|language normalizados
  place_ids  text[] not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create table public.places_cache (
  place_id          text primary key,
  display_name      text,
  formatted_address text,
  city              text,
  primary_type      text,
  types             text[],
  website_uri       text,
  phone             text,
  rating            numeric(2,1),
  user_rating_count integer,
  google_maps_uri   text,
  lat               double precision,
  lng               double precision,
  fetched_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '30 days'
);
create index on public.places_cache (expires_at);

create or replace function public.purge_expired_places()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  delete from public.places_cache where expires_at < now();
  get diagnostics v_n = row_count;
  delete from public.search_corpus where expires_at < now();
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Leads (propiedad del alumno — no expira)
-- -----------------------------------------------------------------------------
create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  search_id         uuid references public.searches(id) on delete set null,
  offer_id          uuid references public.offers(id) on delete set null,
  place_id          text,                          -- almacenable indefinidamente

  business_name     text not null,
  city              text,
  country           text,
  website_url       text,
  website_domain    text,

  -- Todo lo de abajo sale de la web propia del negocio o de nuestro análisis
  web_status        text not null default 'none' check (web_status in ('ok','unreachable','none')),
  public_email      text,
  public_phone      text,
  has_booking_link  boolean not null default false,
  has_form          boolean not null default false,
  has_whatsapp      boolean not null default false,
  social_links      jsonb not null default '{}'::jsonb,
  main_cta          text,
  extract_hash      text,                          -- evita reanalizar web sin cambios

  qualified         boolean not null default false,
  score             integer not null default 0 check (score between 0 and 100),
  score_breakdown   jsonb not null default '{}'::jsonb,
  observed_problem  text,
  evidence          jsonb not null default '[]'::jsonb,
  reason            text,
  confidence        text check (confidence in ('low','medium','high')),

  status            text not null default 'nuevo'
                    check (status in ('nuevo','listo','contactado','respondio','demo','conversacion','cerrado','descartado')),
  next_followup_at  timestamptz,
  followup_count    integer not null default 0,
  is_demo           boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, place_id)
);
create index on public.leads (user_id, status);
create index on public.leads (user_id, score desc);
create index on public.leads (user_id, next_followup_at) where next_followup_at is not null;

create table public.lead_generations (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('angle','message')),
  channel       text check (channel in ('email','instagram','linkedin')),
  language      text not null default 'es',
  content       jsonb not null,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);
create index on public.lead_generations (lead_id, created_at desc);

create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('note','status_change','contacted','followup_scheduled')),
  body       text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.activities (lead_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.offers           enable row level security;
alter table public.searches         enable row level security;
alter table public.leads            enable row level security;
alter table public.lead_generations enable row level security;
alter table public.activities       enable row level security;
alter table public.usage_events     enable row level security;
alter table public.usage_counters   enable row level security;
alter table public.places_cache     enable row level security;
alter table public.search_corpus    enable row level security;
alter table public.invites          enable row level security;
alter table public.app_settings     enable row level security;

create policy "own profile"    on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own"     on public.profiles for update using (id = auth.uid());

create policy "own offers"     on public.offers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own searches"   on public.searches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own leads"      on public.leads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own gens"       on public.lead_generations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own activities" on public.activities for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own usage"      on public.usage_events   for select using (user_id = auth.uid() or public.is_admin());
create policy "own counters"   on public.usage_counters for select using (user_id = auth.uid() or public.is_admin());

-- Caché compartida: lectura para autenticados, escritura solo service role.
create policy "read cache"     on public.places_cache  for select using (auth.role() = 'authenticated');
create policy "read corpus"    on public.search_corpus for select using (auth.role() = 'authenticated');

create policy "admin invites"  on public.invites      for all using (public.is_admin());
create policy "read settings"  on public.app_settings for select using (auth.role() = 'authenticated');
create policy "admin settings" on public.app_settings for update using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. updated_at
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger t_offers   before update on public.offers   for each row execute function public.touch_updated_at();
create trigger t_searches before update on public.searches for each row execute function public.touch_updated_at();
create trigger t_leads    before update on public.leads    for each row execute function public.touch_updated_at();
