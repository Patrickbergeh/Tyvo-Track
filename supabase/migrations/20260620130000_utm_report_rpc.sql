-- Relatório de UTMs: agrega no servidor (sem limite de linhas) o total de acessos
-- por origem e mídia. Faz fallback lendo a UTM da page_url p/ eventos antigos
-- que não têm as colunas dedicadas preenchidas.
create or replace function public.utm_report(
  p_property uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table(src text, med text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(nullif(trim(utm_source), ''), substring(page_url from 'utm_source=([^&]+)'))) as src,
    lower(coalesce(nullif(trim(utm_medium), ''), substring(page_url from 'utm_medium=([^&]+)'))) as med,
    count(*)::bigint as total
  from public.fb_events_raw
  where property_id = p_property
    and (p_from is null or created_at >= p_from)
    and (p_to   is null or created_at <= p_to)
  group by 1, 2
$$;

grant execute on function public.utm_report(uuid, timestamptz, timestamptz) to anon, authenticated;
