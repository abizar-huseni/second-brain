-- Separate keys: the watch and the Google script each get their own key, and the heartbeat uses a
-- server-only secret, so a leaked key can only do one job. Applied automatically on deploy. Safe to re-run.
-- The old shared sync token keeps working for the watch and Google until you make that source its own key.

create table if not exists source_keys (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  source      text not null check (source in ('watch', 'google')),
  token       text not null unique,
  created_at  timestamptz not null default now(),
  primary key (user_id, source)
);

alter table source_keys enable row level security;
drop policy if exists "own source keys" on source_keys;
create policy "own source keys" on source_keys for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Heartbeat secret. Lives in app_secrets, which no browser login can read.
insert into public.app_secrets (key, value)
values ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Every 30 minutes Supabase calls the app's /api/cron with that secret (no sync token needed).
select cron.unschedule(jobid) from cron.job where jobname = 'second-brain-heartbeat';
select cron.schedule(
  'second-brain-heartbeat',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://second-brain-lac-tau.vercel.app/api/cron',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', s.value),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  from public.app_secrets s
  where s.key = 'cron_secret';
  $$
);
