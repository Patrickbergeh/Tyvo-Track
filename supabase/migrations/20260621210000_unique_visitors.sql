-- Conta visitantes únicos (external_id distintos) de uma propriedade,
-- com filtro opcional de período. Usado no card "Visitas únicas".
create or replace function public.unique_visitors(
  p_property uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns bigint
language sql
stable
security invoker
as $$
  select count(distinct external_id)
  from public.fb_events_raw
  where property_id = p_property
    and external_id is not null
    and external_id <> ''
    and (p_from is null or created_at >= p_from)
    and (p_to   is null or created_at <= p_to);
$$;

revoke execute on function public.unique_visitors(uuid, timestamptz, timestamptz) from anon;
grant  execute on function public.unique_visitors(uuid, timestamptz, timestamptz) to authenticated;
