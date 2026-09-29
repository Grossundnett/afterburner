-- Afterburner 0002 — user-extensible sports
--
-- PHASE2.md item 3. `activities.sport` was a check constraint, so adding a
-- sport meant a migration. The complaint was not "add walking" but "why can't
-- I add one myself", so the vocabulary moves into a table the owner can write
-- to through the app.
--
-- Run this in the Supabase SQL Editor top to bottom. The order matters: the
-- foreign key at the end can only be added once every existing activities row
-- has a matching sports row, which is what the backfill above it guarantees.

-- 1. The lookup table -------------------------------------------------------
--
-- Keyed on (user_id, slug) rather than a surrogate id. The composite primary
-- key is what lets activities reference it by the pair it already stores, so
-- no column is added to activities and no existing row has to be rewritten.
--
-- has_distance replaces the hardcoded NO_DISTANCE list in src/lib/sports.ts.
-- Whether a sport has a distance is a property of the sport, so it belongs
-- beside the sport rather than in a constant the app has to keep in step.
create table sports (
  user_id      uuid not null references auth.users on delete cascade,
  slug         text not null,
  label        text not null,
  has_distance boolean not null default false,
  position     int not null default 100,
  created_at   timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table sports enable row level security;

create policy "own sports" on sports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index on sports (user_id, position);

-- 2. The default set --------------------------------------------------------
--
-- A function rather than a repeated VALUES list, because it is needed twice:
-- once by the trigger for accounts created from here on, and once by the
-- backfill for accounts that already exist. Two copies would drift.
create function public.seed_default_sports(target uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.sports (user_id, slug, label, has_distance, position)
  select target, d.slug, d.label, d.has_distance, d.position
  from (values
    ('run',       'Run',       true,   10),
    ('ride',      'Ride',      true,   20),
    ('swim',      'Swim',      true,   30),
    ('walk',      'Walk',      true,   40),
    ('pace_walk', 'Pace walk', true,   50),
    ('tennis',    'Tennis',    false,  60),
    ('football',  'Football',  false,  70),
    ('gym',       'Gym',       false,  80),
    ('yoga',      'Yoga',      false,  90),
    ('other',     'Other',     false, 100)
  ) as d(slug, label, has_distance, position)
  on conflict (user_id, slug) do nothing;
$$;

-- 3. Seed on signup ---------------------------------------------------------
--
-- A second trigger on the same event rather than editing handle_new_user from
-- 0001. The two are independent, so their order does not matter, and leaving
-- 0001 untouched keeps each migration a readable record of one change.
create function public.handle_new_user_sports()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_sports(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created_sports
  after insert on auth.users
  for each row execute function public.handle_new_user_sports();

-- 4. Backfill ---------------------------------------------------------------
--
-- Same reasoning as the profiles backfill in 0001: the trigger above only
-- fires on new auth.users rows, and both existing accounts predate it. Without
-- this the foreign key in step 6 would reject every activity already stored.
do $$
declare
  existing uuid;
begin
  for existing in select id from auth.users loop
    perform public.seed_default_sports(existing);
  end loop;
end;
$$;

-- 5. Drop the old constraint ------------------------------------------------
--
-- Named by Postgres when 0001 created it. If this errors with "constraint does
-- not exist", check the actual name under Database > Tables > activities and
-- substitute it — everything below is unaffected.
alter table activities drop constraint activities_sport_check;

-- 6. Point activities at the table ------------------------------------------
--
-- The composite foreign key does the work the check constraint used to, and
-- more: it enforces that a sport is one of YOUR sports, not merely one of the
-- six allowed globally. on update cascade means renaming a slug later carries
-- through. on delete restrict means a sport cannot be deleted while activities
-- still reference it — a deliberate refusal rather than orphaning history.
alter table activities
  add constraint activities_sport_fkey
  foreign key (user_id, sport)
  references sports (user_id, slug)
  on update cascade
  on delete restrict;
