-- Afterburner 0010 — collapse spend categories to six budget buckets.
--
-- Spend_Research.md is now the source of truth for /spend and supersedes the
-- group/subgroup model from migrations 0007-0009. That model's finer grouping
-- (L&E vs Shopping vs singleton groups) is gone; every category now sits
-- directly under one of exactly six buckets, which is also the unit the new
-- home screen budgets and displays against.
--
--   Food          <- Food (unchanged)
--   Transport     <- Travel
--   Fun           <- Life & Entertainment, Guilty pleasure, Business trips
--   Subscriptions <- Software, apps, games, Dating
--   Big Buy       <- Active sport, fitness; Shopping; Clothes & Footwear
--   Other         <- Health, Child Support, Charity gifts, Energy utilities,
--                     Others (the catch-all key stays named 'Others'; only
--                     its group changes to the bucket name 'Other')
--
-- subgroup is retired — the six-bucket home screen shows whole buckets, not
-- per-category breakdown lines, so the finer label no longer does anything.
-- Column stays (dropping it is a separate, non-additive change) but every
-- row is nulled out.

update public.spend_categories set "group" = 'Transport', subgroup = null
 where "group" = 'Travel';

update public.spend_categories set "group" = 'Fun', subgroup = null
 where "group" = 'Life & Entertainment' or key = 'Guilty pleasure' or key = 'Business trips';

update public.spend_categories set "group" = 'Subscriptions', subgroup = null
 where "group" = 'Software, apps, games' or key = 'Dating';

update public.spend_categories set "group" = 'Big Buy', subgroup = null
 where "group" = 'Shopping' or key = 'Active sport, fitness';

update public.spend_categories set "group" = 'Other', subgroup = null
 where "group" in ('Health', 'Child Support', 'Charity, gifts', 'Energy, utilities', 'Others');

-- Recreate the seed function so new sign-ups start on the six buckets.
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
    (target, 'Meals',                 'Meals',                 '🍽️', 'weekly',  1, 'Food',          null),
    (target, 'Groceries',             'Groceries',             '🛒', 'weekly',  2, 'Food',          null),
    (target, 'Juices, Drinks',        'Juices, Drinks',        '🧃', 'weekly',  3, 'Food',          null),
    (target, 'Restaurant, fast-food', 'Restaurant, fast-food', '🍔', 'weekly',  4, 'Food',          null),
    (target, 'Taxi',                  'Taxi',                  '🛵', 'weekly',  5, 'Transport',     null),
    (target, 'Public transport',      'Public transport',      '🚌', 'weekly',  6, 'Transport',     null),
    (target, 'Fuel',                  'Fuel',                  '⛽', 'weekly',  7, 'Transport',     null),
    (target, 'Parking',               'Parking',               '🅿️', 'weekly',  8, 'Transport',     null),
    -- Monthly
    (target, 'Life & Entertainment',  'Life & Entertainment',  '🎟️', 'monthly', 20, 'Fun',           null),
    (target, 'Guilty pleasure',       'Guilty pleasure',       '🫣', 'monthly', 21, 'Fun',           null),
    (target, 'Business trips',        'Business trips',        '🧳', 'monthly', 22, 'Fun',           null),
    (target, 'Software, apps, games', 'Software, apps, games', '📱', 'monthly', 23, 'Subscriptions', null),
    (target, 'Dating',                'Dating',                '💘', 'monthly', 24, 'Subscriptions', null),
    (target, 'Active sport, fitness', 'Active sport, fitness', '💪', 'monthly', 25, 'Big Buy',       null),
    (target, 'Shopping',              'Shopping',              '🛍️', 'monthly', 26, 'Big Buy',       null),
    (target, 'Clothes & Footwear',    'Clothes & Footwear',    '👕', 'monthly', 27, 'Big Buy',       null),
    (target, 'Health care, doctor',   'Health care, doctor',   '🏥', 'monthly', 28, 'Other',         null),
    (target, 'Health and beauty',     'Health and beauty',     '💄', 'monthly', 29, 'Other',         null),
    (target, 'Child Support',         'Child Support',         '👨‍👩‍👧', 'monthly', 30, 'Other',         null),
    (target, 'Charity, gifts',        'Charity, gifts',        '🎁', 'monthly', 31, 'Other',         null),
    (target, 'Energy, utilities',     'Energy, utilities',     '💡', 'monthly', 32, 'Other',         null),
    (target, 'Others',                'Others',                '📦', 'monthly', 33, 'Other',         null)
  on conflict (user_id, key) do nothing;
end;
$$;
