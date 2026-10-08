-- Second Brain v1 schema
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Every table has user_id + Row Level Security, so each user only ever sees their own rows.

create table if not exists goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id   uuid references goals on delete cascade,   -- null = big goal, set = small step inside it
  title       text not null,
  area        text not null default 'growth',            -- growth | fitness | mind | money | work
  target      numeric not null default 100,
  current     numeric not null default 0,
  unit        text not null default '%',
  deadline    date,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('good', 'bad')),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- One row per habit per day. Good habit: row = "I did it". Bad habit: row = "I slipped".
create table if not exists habit_logs (
  habit_id    uuid not null references habits on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  day         date not null,
  primary key (habit_id, day)
);

create table if not exists checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  day           date not null,
  kind          text not null check (kind in ('morning', 'night')),
  mood          int check (mood between 1 and 10),
  energy        int check (energy between 1 and 10),
  priorities    text,      -- morning: top 3 for today
  wins          text,      -- night: what got done
  journal       text,
  hours_worked  numeric,
  created_at    timestamptz not null default now(),
  unique (user_id, day, kind)
);

alter table goals      enable row level security;
alter table habits     enable row level security;
alter table habit_logs enable row level security;
alter table checkins   enable row level security;

create policy "own goals"      on goals      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own habits"     on habits     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own habit logs" on habit_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own checkins"   on checkins   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
