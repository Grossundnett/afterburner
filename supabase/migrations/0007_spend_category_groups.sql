-- Afterburner 0007 — spend_categories: add group and subgroup columns
--
-- group:    the budget unit. Budgets in spend_month_plans attach here.
--           Dating + Guilty pleasure → "Life & Entertainment" group.
--           Clothes & Footwear → "Shopping" group.
--           All other categories: group = key (singleton groups).
--
-- subgroup: display and leak-flag label only. Shares the parent group's budget.
--           null means the category is its own display unit.
--
-- Unknown labels auto-added by the importer get group = 'Others' (no subgroup).

alter table public.spend_categories
  add column if not exists "group"   text,
  add column if not exists subgroup  text;

-- Weekly groups
update public.spend_categories set "group" = 'Food'
  where key in ('Meals', 'Groceries', 'Juices, Drinks', 'Restaurant, fast-food');

update public.spend_categories set "group" = 'Travel'
  where key in ('Taxi', 'Public transport', 'Fuel', 'Parking');

-- Monthly: L&E umbrella
update public.spend_categories set "group" = 'Life & Entertainment'
  where key = 'Life & Entertainment';

update public.spend_categories
  set "group" = 'Life & Entertainment', subgroup = 'Dating'
  where key = 'Dating';

update public.spend_categories
  set "group" = 'Life & Entertainment', subgroup = 'Guilty pleasure'
  where key = 'Guilty pleasure';

-- Monthly: Shopping umbrella
update public.spend_categories set "group" = 'Shopping'
  where key = 'Shopping';

update public.spend_categories
  set "group" = 'Shopping', subgroup = 'Clothes'
  where key = 'Clothes & Footwear';

-- Monthly singletons: budget named after the category itself
update public.spend_categories
  set "group" = key
  where key in (
    'Software, apps, games', 'Active sport, fitness',
    'Health care, doctor',   'Health and beauty',
    'Child Support',         'Charity, gifts',
    'Energy, utilities',     'Others'
  );

-- Recreate seed function to include group/subgroup for new signups.
create or replace function public.seed_default_spend_categories(target uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.spend_categories
    (user_id, key, label, emoji, kind, sort, "group", subgroup)
  values
    (target, 'Meals',                'Meals',                '🍽️', 'weekly',   1, 'Food',                  null),
    (target, 'Groceries',            'Groceries',            '🛒', 'weekly',   2, 'Food',                  null),
    (target, 'Juices, Drinks',       'Juices, Drinks',       '🧃', 'weekly',   7, 'Food',                  null),
    (target, 'Restaurant, fast-food','Restaurant, fast-food','🍔', 'weekly',   8, 'Food',                  null),
    (target, 'Taxi',                 'Taxi',                 '🛵', 'weekly',   3, 'Travel',                null),
    (target, 'Public transport',     'Public transport',     '🚌', 'weekly',   4, 'Travel',                null),
    (target, 'Fuel',                 'Fuel',                 '⛽', 'weekly',   5, 'Travel',                null),
    (target, 'Parking',              'Parking',              '🅿️', 'weekly',   6, 'Travel',                null),
    (target, 'Software, apps, games','Software, apps, games','📱', 'monthly', 20, 'Software, apps, games', null),
    (target, 'Active sport, fitness','Active sport, fitness','💪', 'monthly', 21, 'Active sport, fitness', null),
    (target, 'Health care, doctor',  'Health care, doctor',  '🏥', 'monthly', 22, 'Health care, doctor',   null),
    (target, 'Health and beauty',    'Health and beauty',    '💄', 'monthly', 23, 'Health and beauty',     null),
    (target, 'Clothes & Footwear',   'Clothes & Footwear',   '👕', 'monthly', 24, 'Shopping',              'Clothes'),
    (target, 'Shopping',             'Shopping',             '🛍️', 'monthly', 25, 'Shopping',              null),
    (target, 'Life & Entertainment', 'Life & Entertainment', '🎟️', 'monthly', 26, 'Life & Entertainment',  null),
    (target, 'Child Support',        'Child Support',        '👨‍👩‍👧', 'monthly', 27, 'Child Support',         null),
    (target, 'Charity, gifts',       'Charity, gifts',       '🎁', 'monthly', 28, 'Charity, gifts',        null),
    (target, 'Energy, utilities',    'Energy, utilities',    '💡', 'monthly', 29, 'Energy, utilities',     null),
    (target, 'Guilty pleasure',      'Guilty pleasure',      '🫣', 'monthly', 30, 'Life & Entertainment',  'Guilty pleasure'),
    (target, 'Dating',               'Dating',               '💘', 'monthly', 31, 'Life & Entertainment',  'Dating'),
    (target, 'Others',               'Others',               '📦', 'monthly', 32, 'Others',                null)
  on conflict (user_id, key) do nothing;
$$;
