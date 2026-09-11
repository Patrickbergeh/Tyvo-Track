-- Only an authenticated dashboard user can delete; audit and deletion are atomic.
create or replace function public.delete_property_with_audit(p_id uuid, p_user_agent text default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare property_name text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select name into property_name from public.properties where id = p_id for update;
  if not found then raise exception 'property_not_found' using errcode = 'P0002'; end if;
  insert into public.deletion_log(property_id, property_name, deleted_by, deleted_by_email, user_agent)
  values (p_id, property_name, auth.uid(), auth.jwt()->>'email', left(p_user_agent, 2048));
  delete from public.properties where id = p_id;
  return true;
end;
$$;
revoke all on function public.delete_property_with_audit(uuid,text) from public, anon;
grant execute on function public.delete_property_with_audit(uuid,text) to authenticated;
