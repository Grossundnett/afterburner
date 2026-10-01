-- Afterburner 0003 — weekly expense tracker
--
-- Two tables: expenses (one row per spend) and spend_settings (one row per
-- user, holds the weekly budget). Both are RLS-locked to the owning user.
--
-- Run this top to bottom in the Supabase SQL Editor.

-- 1. Expenses ----------------------------------------------------------------

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  category    text not null check (category in
                ('food','groc','travel','shop','bills','fun','health','other')),
  note        text check (note is null or char_length(note) <= 80),
  spent_on    date not null,
  created_at  timestamptz not null default now()
);

create index expenses_user_week_idx on public.expenses (user_id, spent_on);

alter table public.expenses enable row level security;

-- SELECT: only return rows this user owns. The (select auth.uid()) subquery
-- form evaluates the function once per statement rather than once per row,
-- which the Postgres planner can use to push the predicate down efficiently.
create policy "expenses_select_own" on public.expenses
  for select using ((select auth.uid()) = user_id);

-- INSERT: the with check clause requires that the user_id column of the new
-- row equals auth.uid(). The column defaults to auth.uid() already, so a
-- normal insert always passes — but without this check someone could POST a
-- crafted request supplying a different user_id and write under another account.
create policy "expenses_insert_own" on public.expenses
  for insert with check ((select auth.uid()) = user_id);

-- UPDATE: needs both clauses. using controls which rows may be targeted (cannot
-- UPDATE another user's rows). with check controls what the row must look like
-- after the update (cannot change user_id to someone else's). One without the
-- other leaves a hole.
create policy "expenses_update_own" on public.expenses
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- DELETE: only using is needed — there is no "after" state to validate. This
-- ensures a user can only delete their own rows.
create policy "expenses_delete_own" on public.expenses
  for delete using ((select auth.uid()) = user_id);

-- 2. Spend settings ----------------------------------------------------------

create table public.spend_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  weekly_budget  integer not null default 5000 check (weekly_budget > 0),
  updated_at     timestamptz not null default now()
);

alter table public.spend_settings enable row level security;

-- Same (select auth.uid()) pattern as above, for the same reason.
create policy "spend_settings_select_own" on public.spend_settings
  for select using ((select auth.uid()) = user_id);

create policy "spend_settings_insert_own" on public.spend_settings
  for insert with check ((select auth.uid()) = user_id);

create policy "spend_settings_update_own" on public.spend_settings
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy: the row is upserted, never deleted.
