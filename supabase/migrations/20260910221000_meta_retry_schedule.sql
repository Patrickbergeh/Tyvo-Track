-- Provision tyvo_meta_processor_key in Vault before applying this migration.
-- The scheduled SQL contains only a secret reference, never the service key.
select cron.schedule('tyvo-meta-retry', '* * * * *', $job$
  select net.http_post(
    url := 'https://tqqqnmdffmzolnlrggqd.supabase.co/functions/v1/process-fb-event',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tyvo_meta_processor_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (select 1 from public.fb_events_raw where processed = false
    and (next_retry_at is null or next_retry_at <= now())
    and (processing_started_at is null or processing_started_at < now() - interval '5 minutes'));
$job$);
