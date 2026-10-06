-- Afterburner 0005 — nap tracking
--
-- D1: A separate table rather than extra fields on `days`, because:
--   - days is unique on (user_id, date) with one wake/sleep pair; that
--     uniqueness is correct and must not be widened.
--   - Multiple naps per day are possible (post-workout + afternoon).
--   - Nap data is purely additive: existing queries against `days` are
--     unchanged and the sleep average stays night-sleep-only.
--
-- No display is built yet. Storing the data is the whole point.

create table public.naps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  date       date not null,
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),
  constraint nap_order check (end_time > start_time)
);

create index on public.naps (user_id, date desc);

alter table public.naps enable row level security;

create policy "own naps" on public.naps
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
