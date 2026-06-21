-- Auditoria de exclusões de propriedades (workspaces).
-- Registro fica SOMENTE no banco (não é exibido no front).
create table if not exists public.deletion_log (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid,
  property_name   text,
  deleted_by      uuid,
  deleted_by_email text,
  user_agent      text,
  deleted_at      timestamptz not null default now()
);

alter table public.deletion_log enable row level security;

-- A chave pública (anon) não acessa
revoke all on public.deletion_log from anon;

-- Usuário logado pode registrar (insert) e consultar (select)
grant select, insert on public.deletion_log to authenticated;

drop policy if exists "authenticated can log deletions" on public.deletion_log;
drop policy if exists "authenticated can read deletions" on public.deletion_log;

create policy "authenticated can log deletions" on public.deletion_log
  for insert to authenticated with check (true);

create policy "authenticated can read deletions" on public.deletion_log
  for select to authenticated using (true);
