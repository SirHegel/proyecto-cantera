-- businessStatus es un campo del SKU Pro. Como las llamadas ya se facturan a
-- Enterprise por pedir website y rating, traerlo no cuesta nada extra y evita
-- analizar negocios cerrados (§17).
alter table public.places_cache
  add column business_status text;

-- El prefiltro no borra: marca. Así el alumno ve cuántos se descartaron y por
-- qué, y nosotros podemos afinar las reglas mirando datos reales.
alter table public.leads
  add column candidate boolean not null default true,
  add column discard_reason text;

create index on public.leads (search_id, candidate);
