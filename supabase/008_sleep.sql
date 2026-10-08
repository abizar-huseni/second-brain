-- Sleep: manual "Going to sleep" / "I'm up" taps, your personal sleep need, and hand-logged nights.
-- Safe to run again.

alter table profile add column if not exists sleep_need_min int not null default 480;
alter table profile add column if not exists bed_at timestamptz;

-- You can add or fix your own sleep records by hand (the watch still writes through the server).
alter table health_samples alter column user_id set default auth.uid();
drop policy if exists "own health samples write" on health_samples;
create policy "own health samples write" on health_samples for insert with check (user_id = auth.uid());
drop policy if exists "own health samples update" on health_samples;
create policy "own health samples update" on health_samples for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own health samples delete" on health_samples;
create policy "own health samples delete" on health_samples for delete using (user_id = auth.uid());
create index if not exists health_samples_type_time on health_samples (user_id, type, end_time desc);
