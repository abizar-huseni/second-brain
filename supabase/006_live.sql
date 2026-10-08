-- Live mode: email + calendar feed, stored coach briefs, "about me", sync status, insights,
-- phone notifications, and a heartbeat that runs every 30 minutes even when your phone and laptop are off.
-- Run once in Supabase SQL Editor (after 005). Safe to re-run.

create table if not exists profile (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  about       text not null default '',
  updated_at  timestamptz not null default now()
);

-- Thought dump: notes get filed by the assistant (rule, fact, idea, worry, goal, reminder)
-- so it remembers them, uses them, and brings them back at the right time.
alter table notes add column if not exists kind          text;
alter table notes add column if not exists title         text;
alter table notes add column if not exists remind_on     date;
alter table notes add column if not exists reminded      boolean not null default false;
alter table notes add column if not exists last_surfaced date;
alter table notes add column if not exists processed     boolean not null default false;

-- Name your assistant (Me page).
alter table profile add column if not exists assistant_name text not null default 'Brain';

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

-- Things the assistant noticed on its own, with an optional one-tap action (add a goal, habit or note).
create table if not exists insights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  kind        text not null default 'growth',   -- deadline | money | health | growth | risk | opportunity
  title       text not null,
  body        text not null,
  priority    int not null default 2,           -- 1 = act today
  sources     jsonb,                            -- [{title, url}]
  action      jsonb,                            -- {type: goal|habit|note, ...}
  status      text not null default 'new'       -- new | done | dismissed
);

-- Your own to-do list. The assistant can add to it too (source = ai) when you accept its plan.
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null,
  day         date,                              -- null = someday
  must        boolean not null default false,    -- non-negotiable
  done        boolean not null default false,
  source      text not null default 'me',        -- me | ai
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);

-- Upcoming expenses: rent, phone, subscriptions, the visa fee...
create table if not exists bills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  amount      numeric not null,
  next_due    date not null,
  every       text not null default 'month',     -- week | month | year | once
  category    text not null default 'bills',
  created_at  timestamptz not null default now()
);

-- The assistant's plans: tomorrow (day), this week, this year, money.
create table if not exists plans (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  kind        text not null,                     -- day | week | year | money
  period      text not null,                     -- 2026-10-09 | 2026-10-06 (week start) | 2026 | 2026-10-06
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, kind, period)
);

-- Quitting (nicotine, junk food...). started_at resets on a slip; longest_hours keeps your record.
create table if not exists quits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  name           text not null,
  started_at     timestamptz not null default now(),
  cost_per_week  numeric not null default 0,
  why            text not null default '',
  longest_hours  numeric not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Every craving you log: what set it off, how strong, and whether you beat it.
create table if not exists cravings (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  quit_id   uuid references quits on delete cascade,
  at        timestamptz not null default now(),
  strength  int,                                  -- 1-5
  trigger   text,                                 -- bar | stress | after food | boredom | social | morning | other
  outcome   text not null default 'beaten'        -- beaten | slipped
);

create table if not exists push_subscriptions (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint    text primary key,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- Server-only settings (notification keys). No policies, so only the server can read it.
create table if not exists app_secrets (
  key    text primary key,
  value  text not null
);

alter table tasks              enable row level security;
alter table bills              enable row level security;
alter table plans              enable row level security;
drop policy if exists "own tasks" on tasks;
create policy "own tasks" on tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own bills" on bills;
create policy "own bills" on bills for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own plans" on plans;
create policy "own plans" on plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table quits              enable row level security;
alter table cravings           enable row level security;
drop policy if exists "own quits" on quits;
create policy "own quits" on quits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own cravings" on cravings;
create policy "own cravings" on cravings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table insights           enable row level security;
alter table push_subscriptions enable row level security;
alter table app_secrets        enable row level security;
drop policy if exists "own insights" on insights;
create policy "own insights" on insights for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own push subscriptions" on push_subscriptions;
create policy "own push subscriptions" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

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

-- Heartbeat: Supabase's built-in pg_cron + pg_net (free) call the app every 30 minutes.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- The heartbeat schedule lives in 010_source_keys.sql.
