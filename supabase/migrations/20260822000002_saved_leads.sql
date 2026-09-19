-- Un resultado de búsqueda y un lead del CRM son la misma fila en dos momentos.
-- Crear una tabla `search_results` paralela habría duplicado 20 columnas para
-- después copiarlas al guardar. Un booleano hace lo mismo (§50).
--
--   saved = false  → apareció en una búsqueda, el alumno aún no lo quiere
--   saved = true   → está en Mis Leads

alter table public.leads
  add column saved boolean not null default false;

create index on public.leads (user_id, saved, score desc);
create index on public.leads (search_id);
