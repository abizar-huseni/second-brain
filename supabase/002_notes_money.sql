-- Second Brain v2 part 1: notes + money
-- Run once in Supabase SQL Editor (after schema.sql).

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  body        text not null,
  tags        text[] not null default '{}',   -- pulled from #hashtags in the body
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Money in and out. Payslips also create an income row here.
create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  day         date not null default current_date,
  kind        text not null check (kind in ('income', 'expense')),
  amount      numeric(12,2) not null check (amount >= 0),
  category    text not null default 'other',
  note        text,
  created_at  timestamptz not null default now()
);

-- UK payslip breakdown.
create table if not exists payslips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  pay_date    date not null,
  employer    text,
  hours       numeric(6,2),
  gross       numeric(12,2) not null,
  tax         numeric(12,2) not null default 0,
  ni          numeric(12,2) not null default 0,   -- National Insurance
  pension     numeric(12,2) not null default 0,
  student_loan numeric(12,2) not null default 0,
  net         numeric(12,2) not null,
  created_at  timestamptz not null default now()
);

create table if not exists debts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  name           text not null,
  start_balance  numeric(12,2) not null,
  balance        numeric(12,2) not null,
  apr            numeric(5,2),                     -- interest rate, % per year
  min_payment    numeric(12,2),
  created_at     timestamptz not null default now()
);

alter table notes        enable row level security;
alter table transactions enable row level security;
alter table payslips     enable row level security;
alter table debts        enable row level security;

drop policy if exists "own notes" on notes;
create policy "own notes" on notes        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own transactions" on transactions;
create policy "own transactions" on transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own payslips" on payslips;
create policy "own payslips" on payslips     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own debts" on debts;
create policy "own debts" on debts        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
