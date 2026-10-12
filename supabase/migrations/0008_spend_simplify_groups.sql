-- Afterburner 0008 — simplify spend groups:
--   * Dating + Guilty pleasure fold back into Software, apps, games
--     (the earlier L&E/subgroup split was more structure than it needs to be).
--   * Health care, doctor + Health and beauty merge into a single "Health" group
--     (one bucket in the budgeter's head, so one budget line).
--
-- No column changes. Only group reassignments plus a seed-function refresh so
-- new users start with the same shape.

update public.spend_categories
   set "group" = 'Software, apps, games', subgroup = null
 where key in ('Dating', 'Guilty pleasure');

update public.spend_categories
   set "group" = 'Health', subgroup = null
 where key in ('Health care, doctor', 'Health and beauty');

-- Recreate seed function so new sign-ups land on the merged groups.
create or replace function public.seed_default_spend_categories(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.spend_categories
    (user_id, key, label, emoji, kind, sort, "group", subgroup)
  values
    -- Weekly
    (target, 'Meals',                 'Meals',                 '🍽️', 'weekly',  1, 'Food',                  null),
    (target, 'Groceries',             'Groceries',             '🛒', 'weekly',  2, 'Food',                  null),
    (target, 'Taxi',                  'Taxi',                  '🛵', 'weekly',  3, 'Travel',                null),
    (target, 'Public transport',      'Public transport',      '🚌', 'weekly',  4, 'Travel',                null),
    (target, 'Fuel',                  'Fuel',                  '⛽', 'weekly',  5, 'Travel',                null),
    (target, 'Parking',               'Parking',               '🅿️', 'weekly',  6, 'Travel',                null),
    (target, 'Juices, Drinks',        'Juices, Drinks',        '🧃', 'weekly',  7, 'Food',                  null),
    (target, 'Restaurant, fast-food', 'Restaurant, fast-food', '🍔', 'weekly',  8, 'Food',                  null),
    -- Monthly
    (target, 'Software, apps, games', 'Software, apps, games', '📱', 'monthly', 20, 'Software, apps, games', null),
    (target, 'Active sport, fitness', 'Active sport, fitness', '💪', 'monthly', 21, 'Active sport, fitness', null),
    (target, 'Health care, doctor',   'Health care, doctor',   '🏥', 'monthly', 22, 'Health',                null),
    (target, 'Health and beauty',     'Health and beauty',     '💄', 'monthly', 23, 'Health',                null),
    (target, 'Clothes & Footwear',    'Clothes & Footwear',    '👕', 'monthly', 24, 'Shopping',              'Clothes'),
    (target, 'Shopping',              'Shopping',              '🛍️', 'monthly', 25, 'Shopping',              null),
    (target, 'Life & Entertainment',  'Life & Entertainment',  '🎟️', 'monthly', 26, 'Life & Entertainment',  null),
    (target, 'Child Support',         'Child Support',         '👨‍👩‍👧', 'monthly', 27, 'Child Support',         null),
    (target, 'Charity, gifts',        'Charity, gifts',        '🎁', 'monthly', 28, 'Charity, gifts',        null),
    (target, 'Energy, utilities',     'Energy, utilities',     '💡', 'monthly', 29, 'Energy, utilities',     null),
    (target, 'Guilty pleasure',       'Guilty pleasure',       '🫣', 'monthly', 30, 'Software, apps, games', null),
    (target, 'Dating',                'Dating',                '💘', 'monthly', 31, 'Software, apps, games', null),
    (target, 'Others',                'Others',                '📦', 'monthly', 32, 'Others',                null)
  on conflict (user_id, key) do nothing;
end;
$$;
