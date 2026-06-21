-- ============================================================================
-- Segurança: fecha o acesso direto ao banco pela chave pública (anon).
--
-- Contexto: o painel passou a exigir login (Supabase Auth). Usuários logados
-- recebem a role `authenticated`. As Edge Functions (loader, track,
-- process-fb-event, analyze-events) usam a SERVICE_ROLE_KEY, que ignora RLS,
-- então continuam funcionando normalmente — o tracking nas páginas dos
-- clientes NÃO é afetado.
--
-- Efeito: a chave pública (a que aparece no <script> do loader) deixa de
-- conseguir ler `access_token`, dados de visitantes, ou apagar/alterar
-- qualquer coisa. Só a role `authenticated` (painel logado) tem acesso.
-- ============================================================================

-- 1) Liga RLS (sem policy = ninguém acessa, exceto service_role) -------------
alter table public.properties     enable row level security;
alter table public.fb_events_raw  enable row level security;

-- Força RLS inclusive para o dono da tabela (defesa extra)
alter table public.properties     force row level security;
alter table public.fb_events_raw  force row level security;

-- 2) Remove qualquer privilégio direto concedido ao anon ----------------------
revoke all on public.properties     from anon;
revoke all on public.fb_events_raw  from anon;

-- Garante que a role `authenticated` tenha os grants de tabela necessários
grant select, insert, update, delete on public.properties     to authenticated;
grant select, insert, update, delete on public.fb_events_raw  to authenticated;

-- 3) Limpa policies antigas permissivas (idempotente) -------------------------
drop policy if exists "authenticated full access" on public.properties;
drop policy if exists "authenticated read"        on public.properties;
drop policy if exists "Enable read access for all users" on public.properties;
drop policy if exists "authenticated full access" on public.fb_events_raw;
drop policy if exists "authenticated read"        on public.fb_events_raw;
drop policy if exists "Enable read access for all users" on public.fb_events_raw;

-- 4) Policies: somente usuários autenticados ---------------------------------
create policy "authenticated full access" on public.properties
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on public.fb_events_raw
  for all to authenticated using (true) with check (true);

-- 5) RPC utm_report: tira do anon, mantém para usuários logados ---------------
revoke execute on function public.utm_report(uuid, timestamptz, timestamptz) from anon;
grant  execute on function public.utm_report(uuid, timestamptz, timestamptz) to authenticated;
