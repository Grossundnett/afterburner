-- Afterburner 0004 — rename 'ride' → 'cycling', add 'home_workout'
--
-- C1: The FK on activities carries ON UPDATE CASCADE, so renaming the slug
-- here propagates to every activities row that references it. Verify after
-- running: `select distinct sport from activities where sport in ('ride','cycling')`.
--
-- C2: 'home_workout' is added between football (70) and gym (80).

-- 1. Rename ride → cycling ------------------------------------------------
UPDATE public.sports
SET slug = 'cycling', label = 'Cycling'
WHERE slug = 'ride';

-- 2. Add home_workout ------------------------------------------------------
INSERT INTO public.sports (user_id, slug, label, has_distance, position)
SELECT id, 'home_workout', 'Home workout', false, 75
FROM auth.users
ON CONFLICT (user_id, slug) DO NOTHING;

-- 3. Update the seed function so new signups get the right defaults ----------
CREATE OR REPLACE FUNCTION public.seed_default_sports(target uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.sports (user_id, slug, label, has_distance, position)
  SELECT target, d.slug, d.label, d.has_distance, d.position
  FROM (VALUES
    ('run',          'Run',          true,   10),
    ('cycling',      'Cycling',      true,   20),
    ('swim',         'Swim',         true,   30),
    ('walk',         'Walk',         true,   40),
    ('pace_walk',    'Pace walk',    true,   50),
    ('tennis',       'Tennis',       false,  60),
    ('football',     'Football',     false,  70),
    ('home_workout', 'Home workout', false,  75),
    ('gym',          'Gym',          false,  80),
    ('yoga',         'Yoga',         false,  90),
    ('other',        'Other',        false, 100)
  ) AS d(slug, label, has_distance, position)
  ON CONFLICT (user_id, slug) DO NOTHING;
$$;
