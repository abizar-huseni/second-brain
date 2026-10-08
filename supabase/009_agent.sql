-- Device agent: a small program on your laptop and phone that proposes actions and runs them
-- only after you approve in the app. Applied automatically on deploy (scripts/migrate.mjs). Safe to re-run.
--
-- How it stays safe:
--   * Each device has its own secret token. Only its sha256 hash is stored here.
--   * Approvals are signed in your browser with a key that never leaves it. The agent checks the
--     signature against keys it trusts locally, so even someone with full access to this database
--     can't make your laptop run anything.
--   * The agent talks to the database only through the functions below, never to tables directly.

create table if not exists devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  kind        text not null default 'windows',     -- windows | android | other
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz,
  info        jsonb,                               -- battery, disk, screen timeout, vault... (sent by the agent)
  revoked     boolean not null default false
);

-- Browsers allowed to approve actions. Public keys only; private keys stay in each browser.
create table if not exists approver_keys (
  id          text primary key,                    -- fingerprint of the public key
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  public_key  jsonb not null,                      -- JWK (P-256)
  created_at  timestamptz not null default now()
);

create table if not exists device_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  device_id    uuid not null references devices on delete cascade,
  created_at   timestamptz not null default now(),
  source       text not null default 'me',         -- me | ai | device
  action       text not null,                      -- a name from the agent's catalogue, e.g. screen_timeout
  params       jsonb not null default '{}',
  title        text not null,
  why          text,
  dedupe       text,                               -- stops the same suggestion being made twice
  status       text not null default 'proposed',   -- proposed | approved | running | done | failed | rejected | expired
  approved_at  timestamptz,
  key_id       text,
  signature    text,
  started_at   timestamptz,
  finished_at  timestamptz,
  result       text,
  notified     boolean not null default false,
  expires_at   timestamptz                         -- time-sensitive suggestions (e.g. "it's 2am, sleep?")
);
alter table device_actions add column if not exists expires_at timestamptz;
create index if not exists device_actions_device_status on device_actions (device_id, status);

-- Obsidian notes synced by the agent keep their file path here, so edits update the same note.
alter table notes add column if not exists source      text not null default 'app';
alter table notes add column if not exists external_id text;
create unique index if not exists notes_user_external on notes (user_id, external_id);

alter table devices        enable row level security;
alter table approver_keys  enable row level security;
alter table device_actions enable row level security;
drop policy if exists "own devices" on devices;
create policy "own devices" on devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own approver keys" on approver_keys;
create policy "own approver keys" on approver_keys for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own device actions" on device_actions;
create policy "own device actions" on device_actions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Finds the device for a token, or fails.
create or replace function agent_device(p_token text) returns devices
language plpgsql security definer set search_path = public as $$
declare d devices;
begin
  select * into d from devices where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and not revoked;
  if d.id is null then raise exception 'invalid device token' using errcode = '28000'; end if;
  return d;
end $$;

-- Called by the agent every few seconds: reports status and results, collects approved actions.
create or replace function agent_poll(p_token text, p_info jsonb default null, p_results jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d devices := agent_device(p_token);
  r jsonb;
  out jsonb;
begin
  update devices set last_seen = now(), info = coalesce(p_info, info) where id = d.id;

  for r in select * from jsonb_array_elements(coalesce(p_results, '[]')) loop
    update device_actions
       set status = case when r->>'status' = 'done' then 'done' else 'failed' end,
           result = left(coalesce(r->>'result', ''), 4000),
           finished_at = now()
     where id = (r->>'id')::uuid and device_id = d.id and status in ('approved', 'running');
  end loop;

  update device_actions set status = 'expired'
   where device_id = d.id
     and ((status = 'proposed' and created_at < now() - interval '7 days') or (status in ('proposed', 'approved') and expires_at < now()));

  with picked as (
    update device_actions set status = 'running', started_at = now()
     where device_id = d.id and status = 'approved' and signature is not null and (expires_at is null or expires_at > now())
    returning id, device_id, action, params, approved_at, key_id, signature
  )
  select coalesce(jsonb_agg(to_jsonb(picked)), '[]') into out from picked;

  return jsonb_build_object(
    'device', jsonb_build_object('id', d.id, 'name', d.name),
    'actions', out,
    'keys', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'pub', k.public_key)), '[]') from approver_keys k where k.user_id = d.user_id)
  );
end $$;

-- The agent suggests something it noticed (screen goes black too fast, disk nearly full...).
-- Skips a suggestion already waiting, one you said no to this week, or one done today.
create or replace function agent_propose(p_token text, p_actions jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  d devices := agent_device(p_token);
  a jsonb;
  n int := 0;
begin
  for a in select * from jsonb_array_elements(coalesce(p_actions, '[]')) limit 10 loop
    if a->>'dedupe' is not null and exists (
      select 1 from device_actions x
       where x.device_id = d.id and x.dedupe = a->>'dedupe'
         and (x.status in ('proposed', 'approved', 'running')
              or (x.status = 'rejected' and x.created_at > now() - interval '7 days')
              or (x.status in ('done', 'failed') and x.created_at > now() - interval '1 day'))
    ) then continue; end if;
    insert into device_actions (user_id, device_id, source, action, params, title, why, dedupe, expires_at)
    values (d.user_id, d.id, 'device', left(a->>'action', 60), coalesce(a->'params', '{}'), left(coalesce(a->>'title', a->>'action'), 200), left(a->>'why', 500), left(a->>'dedupe', 200),
            case when a ? 'expires_min' then now() + make_interval(mins => least((a->>'expires_min')::int, 10080)) end);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Obsidian (or any markdown folder) notes from the device. Bulk = first sync, so the assistant
-- doesn't try to file hundreds of old notes at once.
create or replace function agent_notes(p_token text, p_notes jsonb, p_bulk boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  d devices := agent_device(p_token);
  x jsonb;
  n int := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p_notes, '[]')) limit 500 loop
    insert into notes (user_id, body, tags, title, created_at, source, external_id, processed)
    values (
      d.user_id,
      left(x->>'body', 20000),
      coalesce(array(select jsonb_array_elements_text(x->'tags')), '{}'),
      left(x->>'title', 200),
      coalesce((x->>'created_at')::timestamptz, now()),
      left(coalesce(x->>'source', 'obsidian'), 30),
      left(x->>'external_id', 500),
      p_bulk
    )
    on conflict (user_id, external_id) do update
      set body = excluded.body, tags = excluded.tags, title = excluded.title,
          processed = case when notes.body = excluded.body then notes.processed else p_bulk end;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function agent_device(text) from public, anon, authenticated;
grant execute on function agent_poll(text, jsonb, jsonb) to anon, authenticated;
grant execute on function agent_propose(text, jsonb) to anon, authenticated;
grant execute on function agent_notes(text, jsonb, boolean) to anon, authenticated;
