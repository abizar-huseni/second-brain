-- v4: sleep tracking, the laptop agent, and locking the app to you.
-- Run once in Supabase SQL Editor (safe to run again).

-- 1. Only one account can ever exist: yours. Blocks strangers from signing up on your project
--    and using your AI keys. (To start over: delete your user in Authentication first.)
create or replace function public.only_one_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Sign-ups are closed: this Second Brain belongs to one person.';
  end if;
  return new;
end $$;
drop trigger if exists only_one_user on auth.users;
create trigger only_one_user before insert on auth.users for each row execute function public.only_one_user();

-- 2. Sleep: manual "going to sleep" / "I'm up" taps, and your personal sleep need.
alter table profile add column if not exists sleep_need_min int not null default 480;
alter table profile add column if not exists bed_at timestamptz;

-- You can add or fix your own sleep records by hand (the watch writes through the server).
drop policy if exists "own health samples write" on health_samples;
create policy "own health samples write" on health_samples for insert with check (user_id = auth.uid());
drop policy if exists "own health samples update" on health_samples;
create policy "own health samples update" on health_samples for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own health samples delete" on health_samples;
create policy "own health samples delete" on health_samples for delete using (user_id = auth.uid());
alter table health_samples alter column user_id set default auth.uid();
create index if not exists health_samples_type_time on health_samples (user_id, type, end_time desc);

-- 3. Laptop agent ("Brain Link"): the assistant suggests, you approve, your laptop does it.
create table if not exists agent_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  action      text not null,
  params      jsonb not null default '{}'::jsonb,
  reason      text,
  device_id   text,                                   -- null = whichever laptop is online
  source      text not null default 'me',            -- me | brain
  status      text not null default 'proposed',      -- proposed | approved | running | done | failed | denied | expired
  result      jsonb,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  done_at     timestamptz
);
alter table agent_jobs add column if not exists device_id text;
create index if not exists agent_jobs_status on agent_jobs (user_id, status, created_at desc);

create table if not exists agent_devices (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  device_id   text not null,
  name        text,
  os          text,
  actions     jsonb,                                  -- what this device can do
  info        jsonb,                                  -- battery, disk, uptime
  last_seen   timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table agent_jobs    enable row level security;
alter table agent_devices enable row level security;
drop policy if exists "own agent jobs" on agent_jobs;
create policy "own agent jobs" on agent_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own agent devices" on agent_devices;
create policy "own agent devices" on agent_devices for select using (user_id = auth.uid());
drop policy if exists "own agent devices delete" on agent_devices;
create policy "own agent devices delete" on agent_devices for delete using (user_id = auth.uid());
