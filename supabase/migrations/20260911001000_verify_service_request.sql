-- Validate legacy service JWTs through PostgREST's signature verification.
-- This RPC exposes no data and performs no writes.
create or replace function public.verify_service_request()
returns boolean language sql stable security invoker set search_path = public, pg_temp
as $$ select current_user = 'service_role' and auth.role() = 'service_role'; $$;
revoke all on function public.verify_service_request() from public, anon, authenticated;
grant execute on function public.verify_service_request() to service_role;
