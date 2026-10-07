-- Afterburner 0006 — /spend v2: Wallet labels, month plan, CSV import
--
-- Additive except for two pre-approved constraint changes on `expenses`:
--   1. Drop the 8-value category CHECK; validation moves to Zod.
--   2. Raise the note limit from 80 → 300 chars.
--
-- Category key migration (all existing rows):
--   food   → Meals              groc  → Groceries
--   travel → Taxi               shop  → Shopping
--   bills  → Software, apps, games
--   fun    → Life & Entertainment
--   health → Health care, doctor
--   other  → Others
--
-- Run top-to-bottom in the Supabase SQL Editor.

-- ============================================================================
-- 1. spend_categories — the user's category vocabulary
-- ============================================================================

create table public.spend_categories (
  user_id uuid not null references auth.users on delete cascade,
  key     text not null,
  label   text not null,
  emoji   text not null default '📦',
  kind    text not null default 'monthly'
            check (kind in ('weekly','monthly')),
  sort    integer not null default 99,
  primary key (user_id, key)
);

create index on public.spend_categories (user_id, kind, sort);

alter table public.spend_categories enable row level security;

create policy "own spend_categories" on public.spend_categories
  for all
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Seed function — mirrors seed_default_sports; call it for new signups.
create or replace function public.seed_default_spend_categories(target uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.spend_categories (user_id, key, label, emoji, kind, sort)
  values
    -- Weekly: count against weekly allowance
    (target, 'Meals',               'Meals',               '🍽️', 'weekly',  1),
    (target, 'Groceries',           'Groceries',           '🛒', 'weekly',  2),
    (target, 'Taxi',                'Taxi',                '🛵', 'weekly',  3),
    (target, 'Public transport',    'Public transport',    '🚌', 'weekly',  4),
    (target, 'Fuel',                'Fuel',                '⛽', 'weekly',  5),
    (target, 'Parking',             'Parking',             '🅿️', 'weekly',  6),
    (target, 'Juices, Drinks',      'Juices, Drinks',      '🧃', 'weekly',  7),
    (target, 'Restaurant, fast-food','Restaurant, fast-food','🍔','weekly', 8),
    -- Monthly: tracked against per-category budgets
    (target, 'Software, apps, games',  'Software, apps, games',  '📱', 'monthly', 20),
    (target, 'Active sport, fitness',  'Active sport, fitness',  '💪', 'monthly', 21),
    (target, 'Health care, doctor',    'Health care, doctor',    '🏥', 'monthly', 22),
    (target, 'Health and beauty',      'Health and beauty',      '💄', 'monthly', 23),
    (target, 'Clothes & Footwear',     'Clothes & Footwear',     '👕', 'monthly', 24),
    (target, 'Shopping',               'Shopping',               '🛍️', 'monthly', 25),
    (target, 'Life & Entertainment',   'Life & Entertainment',   '🎟️', 'monthly', 26),
    (target, 'Child Support',          'Child Support',          '👨‍👩‍👧', 'monthly', 27),
    (target, 'Charity, gifts',         'Charity, gifts',         '🎁', 'monthly', 28),
    (target, 'Energy, utilities',      'Energy, utilities',      '💡', 'monthly', 29),
    (target, 'Guilty pleasure',        'Guilty pleasure',        '🫣', 'monthly', 30),
    (target, 'Dating',                 'Dating',                 '💘', 'monthly', 31),
    (target, 'Others',                 'Others',                 '📦', 'monthly', 32)
  on conflict (user_id, key) do nothing;
$$;

-- Backfill all existing users.
select public.seed_default_spend_categories(id) from auth.users;

-- ============================================================================
-- 2. expenses — drop old constraints, migrate rows, add columns
-- ============================================================================

-- Drop the 8-value CHECK; category is now free text validated by Zod against
-- spend_categories. IF EXISTS guards against a renamed constraint.
alter table public.expenses
  drop constraint if exists expenses_category_check;

-- Migrate existing rows to Wallet label keys.
update public.expenses set category = case category
  when 'food'   then 'Meals'
  when 'groc'   then 'Groceries'
  when 'travel' then 'Taxi'
  when 'shop'   then 'Shopping'
  when 'bills'  then 'Software, apps, games'
  when 'fun'    then 'Life & Entertainment'
  when 'health' then 'Health care, doctor'
  when 'other'  then 'Others'
  else category
end;

-- Raise note limit: 80 → 300.
alter table public.expenses
  drop constraint if exists expenses_note_check;

alter table public.expenses
  add constraint expenses_note_len
  check (note is null or char_length(note) <= 300);

-- New columns — all additive; existing rows get the defaults.
alter table public.expenses
  add column if not exists source          text        not null default 'manual',
  add column if not exists source_ts       timestamptz,
  add column if not exists account         text,
  add column if not exists wallet_category text,
  add column if not exists guilty          boolean     not null default false,
  add column if not exists unlabeled       boolean     not null default false;

-- Deduplication key for CSV imports: same timestamp + account = same row.
-- Partial index so it only applies to CSV rows.
create unique index if not exists expenses_csv_dedup
  on public.expenses (user_id, source_ts, account)
  where source = 'wallet_csv';

-- ============================================================================
-- 3. money_moves — salary, investments and transfers from CSV
-- ============================================================================

create table public.money_moves (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users on delete cascade,
  kind        text        not null check (kind in ('income','investment','transfer')),
  amount      numeric(10,2) not null check (amount > 0),
  occurred_at timestamptz not null,
  account     text        not null,
  to_account  text,
  note        text,
  source_ts   timestamptz,
  created_at  timestamptz not null default now(),
  -- Each CSV row maps to exactly one money_moves row; the triple (ts, account,
  -- kind) is unique because a transfer produces two CSV rows with the same
  -- timestamp but different accounts — the account column differentiates them.
  unique (user_id, source_ts, account, kind)
);

create index on public.money_moves (user_id, occurred_at desc);

alter table public.money_moves enable row level security;

create policy "own money_moves" on public.money_moves
  for all
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 4. spend_month_plans — month-level budget
-- ============================================================================

create table public.spend_month_plans (
  user_id          uuid          not null references auth.users on delete cascade,
  month            text          not null check (month ~ '^\d{4}-\d{2}$'),
  salary           numeric(10,2) not null default 0,
  investments      numeric(10,2) not null default 0,
  savings_target   numeric(10,2) not null default 0,
  food_budget      numeric(10,2) not null default 0,
  transport_budget numeric(10,2) not null default 0,
  buffer           numeric(10,2) not null default 0,
  -- week_weights.first_two applies to weeks 1-2; week_weights.rest to weeks 3+
  week_weights     jsonb         not null default '{"first_two":0.8,"rest":1.2}',
  -- category_budgets: { "Category label": amount_numeric }
  category_budgets jsonb         not null default '{}',
  created_at       timestamptz   not null default now(),
  primary key (user_id, month)
);

alter table public.spend_month_plans enable row level security;

create policy "own spend_month_plans" on public.spend_month_plans
  for all
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 5. wait_list — 48-hour purchase pause
-- ============================================================================

create table public.wait_list (
  id         uuid          primary key default gen_random_uuid(),
  user_id    uuid          not null references auth.users on delete cascade,
  item       text          not null,
  price      numeric(10,2) not null check (price > 0),
  category   text          not null,
  added_at   timestamptz   not null default now(),
  decision   text          not null default 'pending'
               check (decision in ('pending','bought','dropped')),
  decided_at timestamptz,
  created_at timestamptz   not null default now()
);

create index on public.wait_list (user_id, decision, added_at desc);

alter table public.wait_list enable row level security;

create policy "own wait_list" on public.wait_list
  for all
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
