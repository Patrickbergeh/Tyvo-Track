begin;
alter table public.geo_cache add column if not exists lat double precision, add column if not exists lon double precision;
alter table public.fb_events_raw
  add column if not exists referrer text,
  add column if not exists landing_url text,
  add column if not exists traffic_source text,
  add column if not exists traffic_medium text,
  add column if not exists traffic_kind text,
  add column if not exists attribution_reason text,
  add column if not exists custom_data jsonb,
  add column if not exists ingest_key text,
  add column if not exists delivery_status text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists processing_started_at timestamptz;

-- Existing duplicate rows remain intact for audit. New requests are idempotent.
create unique index if not exists fb_events_ingest_key on public.fb_events_raw(ingest_key);
create index if not exists fb_events_pending on public.fb_events_raw(next_retry_at,created_at) where processed = false;
create index if not exists fb_events_property_created on public.fb_events_raw(property_id,created_at desc);
create index if not exists fb_events_identity on public.fb_events_raw(property_id,event_name,event_id);

-- Atomic lease: immediate delivery and cron cannot process the same row together.
create or replace function public.claim_meta_events(p_ids uuid[] default null, p_property uuid default null)
returns setof public.fb_events_raw language sql security definer set search_path = public as $$
  with candidates as (
    select id from public.fb_events_raw
    where processed = false
      and (p_ids is null or id = any(p_ids))
      and (p_property is null or property_id = p_property)
      and (next_retry_at is null or next_retry_at <= now())
      and (processing_started_at is null or processing_started_at < now() - interval '5 minutes')
    order by created_at asc
    limit 25 for update skip locked
  )
  update public.fb_events_raw e
  set processing_started_at = now(), attempt_count = e.attempt_count + 1, delivery_status = 'processing'
  from candidates c where e.id = c.id returning e.*
$$;
revoke all on function public.claim_meta_events(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.claim_meta_events(uuid[], uuid) to service_role;

-- Report counts page visits, not PageView + ViewContent + every conversion.
create or replace function public.utm_report(p_property uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table(src text, med text, total bigint)
language sql stable security invoker set search_path = public as $$
  select lower(coalesce(nullif(traffic_source,''),nullif(trim(utm_source),''),substring(page_url from '[?&]utm_source=([^&]+)'))),
         lower(coalesce(nullif(traffic_medium,''),nullif(trim(utm_medium),''),substring(page_url from '[?&]utm_medium=([^&]+)'))),
         count(distinct coalesce(nullif(event_id,''),id::text))::bigint
  from public.fb_events_raw
  where property_id = p_property and event_name = 'PageView'
    and (p_from is null or created_at >= p_from) and (p_to is null or created_at <= p_to)
  group by 1,2
$$;
revoke all on function public.utm_report(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.utm_report(uuid,timestamptz,timestamptz) to authenticated,service_role;
-- Retire public access to old tables which expose tracking credentials and webhook payloads.
revoke all on public.trackers, public.tracker_events, public.guru_webhooks from anon, public;
drop policy if exists "allow_all_properties" on public.properties;
drop policy if exists "public read by id" on public.properties;
drop policy if exists "Allow anonymous insert" on public.fb_events_raw;
drop policy if exists "Allow anonymous select" on public.fb_events_raw;
update storage.buckets set public = false where id = 'analyses';
commit;
