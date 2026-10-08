-- Physique: weigh-ins and body composition (Samsung export, the watch through Health Connect, or typed in),
-- and a training log (typed in, or workouts from the watch). Applied automatically on deploy. Safe to re-run.

create table if not exists body_log (
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  measured_at   timestamptz not null,
  source        text not null default 'manual' check (source in ('manual', 'samsung', 'watch')),
  weight_kg     numeric(5,1),
  body_fat_pct  numeric(4,1),
  muscle_kg     numeric(5,1),   -- skeletal muscle mass (Samsung)
  lean_kg       numeric(5,1),   -- fat-free mass (Samsung, Health Connect)
  primary key (user_id, source, measured_at)
);
create index if not exists body_log_time on body_log (user_id, measured_at desc);

create table if not exists training_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  day         date not null,
  what        text not null,
  minutes     int check (minutes between 1 and 600),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists training_log_day on training_log (user_id, day desc);
-- Workouts from the watch land here too, with their type, so the log shows what you actually did.
alter table training_log add column if not exists source text not null default 'manual';
alter table training_log add column if not exists started_at timestamptz;
create unique index if not exists training_log_session on training_log (user_id, source, started_at);

alter table body_log     enable row level security;
alter table training_log enable row level security;
drop policy if exists "own body log" on body_log;
create policy "own body log" on body_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own training log" on training_log;
create policy "own training log" on training_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
