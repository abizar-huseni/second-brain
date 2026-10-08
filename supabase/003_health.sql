-- Second Brain v2 part 2: daily health data from the Galaxy Watch (Samsung Health export)
-- Run once in Supabase SQL Editor.

create table if not exists health_days (
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  day           date not null,
  steps         int,
  distance_km   numeric(6,2),
  active_min    int,
  calories      int,
  exercise_min  int,
  workouts      int,
  sleep_min     int,          -- total sleep ending that morning
  sleep_score   int,
  hr_avg        int,
  hr_min        int,
  stress_avg    int,
  updated_at    timestamptz not null default now(),
  primary key (user_id, day)
);

alter table health_days enable row level security;
drop policy if exists "own health days" on health_days;
create policy "own health days" on health_days for all using (user_id = auth.uid()) with check (user_id = auth.uid());
