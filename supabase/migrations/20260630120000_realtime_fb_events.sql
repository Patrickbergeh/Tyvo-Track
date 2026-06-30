-- Habilita Supabase Realtime na fb_events_raw para atualização em tempo real
-- no painel (push de INSERT/UPDATE para clientes autenticados; respeita RLS).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fb_events_raw'
  ) then
    alter publication supabase_realtime add table public.fb_events_raw;
  end if;
end $$;
