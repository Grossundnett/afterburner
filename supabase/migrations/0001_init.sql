-- Afterburner initial schema
--
-- Applied by hand in the Supabase SQL Editor on 19 September 2026, then saved
-- here so the schema is version-controlled and a fresh project can reproduce
-- this exact state.
--
-- Two things in here are worth reading rather than skimming.
--
-- 1. Every policy carries "with check" as well as "using". "using" controls
--    which rows you can read, update and delete; "with check" controls what you
--    are allowed to write. A "for all" policy with only "using" still lets you
--    INSERT rows carrying someone else's user_id. You could not read them back,
--    but you would have written into their data -- and because of the unique
--    constraints below you could also take a date away from them permanently,
--    since they could no longer insert their own row for it. The omission is
--    invisible in testing, because reads still look correctly isolated.
--
-- 2. unique (user_id, source, external_id) on activities is what stops Strava
--    re-imports duplicating rows in phase 4. Cheap now, painful once there is
--    data.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  height_cm int,
  wake_target time not null default '07:00',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  wake_time time,
  sleep_time time,
  blocker_code text,
  blocker_note text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  sport text not null check (sport in
    ('run','ride','swim','gym','yoga','other')),
  distance_m int,
  duration_s int,
  avg_pace_s_per_km int,
  perceived_effort int check (perceived_effort between 1 and 5),
  source text not null default 'manual',
  external_id text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  weight_kg numeric(5,2),
  bio_score numeric(5,2),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index on days (user_id, date desc);
create index on activities (user_id, date desc);
create index on body_metrics (user_id, date desc);

alter table profiles     enable row level security;
alter table days         enable row level security;
alter table activities   enable row level security;
alter table body_metrics enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own days" on days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own activities" on activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own body metrics" on body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for accounts that already existed.
--
-- The trigger above only fires on INSERT into auth.users. Any account that
-- signed in before this migration ran already has its auth.users row, so no
-- profile was ever created for it. Without this an authenticated user has no
-- profiles row at all, which breaks the day log form the moment it reads a
-- wake target.
insert into public.profiles (id, display_name)
select id, raw_user_meta_data->>'full_name' from auth.users
on conflict (id) do nothing;
