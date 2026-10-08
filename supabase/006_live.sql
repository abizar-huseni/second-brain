-- Live mode: email + calendar feed, stored coach briefs, "about me", sync status,
-- and a heartbeat that runs every 30 minutes even when your phone and laptop are off.
-- Run once in Supabase SQL Editor (after 005). Safe to re-run.

create table if not exists profile (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  about       text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists inbox (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  external_id  text not null,
  thread_id    text,
  from_name    text,
  from_email   text,
  subject      text,
  snippet      text,
  received_at  timestamptz not null,
  unread       boolean not null default true,
  starred      boolean not null default false,
  category     text not null default 'other',  -- money | uni | jobs | other
  primary key (user_id, external_id)
);

create table if not exists events (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  external_id  text not null,
  title        text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  location     text,
  primary key (user_id, external_id)
);

create table if not exists briefs (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  day         date not null,
  slot        text not null,                 -- am | pm
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, day, slot)
);

create table if not exists sync_status (
  user_id     uuid not null references auth.users on delete cascade,
  source      text not null,                 -- watch | bank | google | heartbeat
  last_ok     timestamptz,
  last_error  text,
  info        jsonb,
  primary key (user_id, source)
);

alter table profile     enable row level security;
alter table inbox       enable row level security;
alter table events      enable row level security;
alter table briefs      enable row level security;
alter table sync_status enable row level security;

drop policy if exists "own profile" on profile;
create policy "own profile" on profile for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own inbox" on inbox;
create policy "own inbox" on inbox for select using (user_id = auth.uid());
drop policy if exists "own events" on events;
create policy "own events" on events for select using (user_id = auth.uid());
drop policy if exists "own briefs" on briefs;
create policy "own briefs" on briefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own sync status" on sync_status;
create policy "own sync status" on sync_status for select using (user_id = auth.uid());

-- Heartbeat: every 30 minutes Supabase calls the app's /api/cron with your sync token.
-- Uses Supabase's built-in pg_cron + pg_net (free). Change the URL if you deploy elsewhere.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'second-brain-heartbeat';
select cron.schedule(
  'second-brain-heartbeat',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://second-brain-lac-tau.vercel.app/api/cron',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-token', t.token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  from public.sync_tokens t;
  $$
);
