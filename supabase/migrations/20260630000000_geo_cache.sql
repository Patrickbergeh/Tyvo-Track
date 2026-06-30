-- Cache de geolocalização por IP. A função `track` (service_role) consulta/grava
-- aqui para não repetir chamadas à API de geo e não estourar o limite mensal.
create table if not exists public.geo_cache (
  ip         text primary key,
  country    text,
  state      text,
  city       text,
  zip        text,
  created_at timestamptz not null default now()
);

alter table public.geo_cache enable row level security;

-- Chave pública não acessa; service_role (track) ignora RLS por design.
revoke all on public.geo_cache from anon;
grant all on public.geo_cache to service_role;
