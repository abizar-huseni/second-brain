-- Live watch sync: raw samples pushed from your phone (HC Webhook app → Health Connect → here).
-- Run once in Supabase SQL Editor.

create table if not exists health_samples (
  user_id     uuid not null references auth.users on delete cascade,
  type        text not null,          -- steps | sleep | heart_rate | resting_heart_rate | exercise | active_calories | distance
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  value       numeric not null,       -- count, seconds, bpm, kcal or metres depending on type
  value_min   numeric,                -- heart rate bucket minimum
  primary key (user_id, type, start_time, end_time)
);

-- One secret token per user, used in the webhook header so only your phone can push data.
create table if not exists sync_tokens (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

alter table health_samples enable row level security;
alter table sync_tokens    enable row level security;
drop policy if exists "own health samples" on health_samples;
create policy "own health samples" on health_samples for select using (user_id = auth.uid());
drop policy if exists "own sync token" on sync_tokens;
create policy "own sync token" on sync_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
