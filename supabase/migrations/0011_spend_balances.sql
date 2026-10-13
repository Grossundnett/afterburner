-- Afterburner 0011 — manual balance snapshots + cash-counting toggle.
--
-- Balances are snapshots, not a running total: each row is "account held
-- ₹X as of this timestamp". The current balance for an account is that last
-- snapshot minus every expense logged against the account since, so the
-- hero's cash figure stays correct between manual corrections rather than
-- drifting the moment a spend is logged.

create table public.spend_balances (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users on delete cascade,
  account     text          not null check (account in ('Apex', 'BOB', 'Cash')),
  amount      numeric(10,2) not null,
  snapshot_at timestamptz   not null default now(),
  created_at  timestamptz   not null default now()
);

create index on public.spend_balances (user_id, account, snapshot_at desc);

alter table public.spend_balances enable row level security;

create policy "own spend_balances" on public.spend_balances
  for all
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- count_bob_as_cash: whether BOB's spendable remainder (after the payday
-- sweep) counts toward "real money left" alongside Apex and Cash. Defaults
-- on, since the weekly BOB-to-Apex transfer habit isn't established yet —
-- flip it off once that transfer happens reliably and BOB stops being
-- day-to-day spending money.
alter table public.spend_settings
  add column if not exists count_bob_as_cash boolean not null default true;

-- Manual expenses never recorded which account the money came from (only
-- Wallet-CSV imports did). Balance drawdown needs it for every row, so
-- manual entries default to Apex — the primary spending account per the
-- research brief — with the log form free to offer a picker later.
alter table public.expenses
  alter column account set default 'Apex';

update public.expenses set account = 'Apex' where account is null and source = 'manual';
