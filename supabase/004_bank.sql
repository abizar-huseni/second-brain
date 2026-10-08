-- Second Brain: bank statements + live bank sync
-- Run once in Supabase SQL Editor.

alter table transactions add column if not exists source      text not null default 'manual';  -- manual | csv | bank
alter table transactions add column if not exists account     text;                              -- e.g. "Lloyds current"
alter table transactions add column if not exists description text;                              -- what the bank calls it
alter table transactions add column if not exists external_id text;                              -- stops duplicate imports
alter table transactions drop constraint if exists transactions_external;
alter table transactions add constraint transactions_external unique (user_id, external_id);

-- Live connections made through Enable Banking (one row per bank login).
create table if not exists bank_connections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  bank         text not null,
  session_id   text not null,
  accounts     jsonb not null default '[]',
  valid_until  timestamptz,
  last_synced  timestamptz,
  created_at   timestamptz not null default now()
);

alter table bank_connections enable row level security;
drop policy if exists "own bank connections" on bank_connections;
create policy "own bank connections" on bank_connections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
