-- Keep privileges and cross-record references under server control.
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke all on function public.consume_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_quota(uuid, text, integer) to service_role;
revoke all on function public.purge_expired_places() from public, anon, authenticated;
grant execute on function public.purge_expired_places() to service_role;

create or replace function public.get_limit(p_user_id uuid, p_kind text)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' and (auth.uid() is null or (auth.uid() <> p_user_id and not public.is_admin())) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return (select coalesce((p.limits ->> p_kind)::int, (s.default_limits ->> p_kind)::int, 0)
    from public.profiles p cross join public.app_settings s where p.id = p_user_id);
end;
$$;

alter table public.usage_counters add constraint nonnegative_usage check (used >= 0);

create policy "owned offer reference" on public.searches as restrictive for all to authenticated
using (true) with check (offer_id is null or exists(select 1 from public.offers o where o.id = offer_id and o.user_id = auth.uid()));
create policy "owned lead reference" on public.lead_generations as restrictive for all to authenticated
using (true) with check (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid()));
create policy "owned activity reference" on public.activities as restrictive for all to authenticated
using (true) with check (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid()));
create policy "owned search reference" on public.leads as restrictive for all to authenticated
using (true) with check (
  (search_id is null or exists(select 1 from public.searches s where s.id = search_id and s.user_id = auth.uid()))
  and (offer_id is null or exists(select 1 from public.offers o where o.id = offer_id and o.user_id = auth.uid()))
);

-- Serialize the first signup so concurrent registrations cannot create two admins.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_first boolean;
  v_invited boolean;
begin
  perform pg_advisory_xact_lock(hashtext('cantera_initial_user'));
  select count(*) = 0 into v_is_first from public.profiles;
  select exists(select 1 from public.invites where email = lower(new.email) and used_at is null) into v_invited;
  if not v_is_first and not v_invited then
    raise exception 'NOT_INVITED' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, role)
    values (new.id, lower(new.email), case when v_is_first then 'admin' else 'student' end);
  update public.invites set used_at = now() where email = lower(new.email);
  return new;
end;
$$;
