-- La ciudad pasa a ser opcional: buscar en todo un país es un caso legítimo,
-- sobre todo en mercados pequeños como Irlanda, Singapur o Emiratos, donde
-- obligar a elegir ciudad recorta el mercado sin motivo.
alter table public.searches
  alter column city drop not null;
