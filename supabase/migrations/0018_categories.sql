-- Afterburner 0018 — six-category model with optional sub-labels.
-- Idempotent — safe to run more than once. Run this whole file in one go
-- in the Supabase SQL Editor, then tell Claude "0018 ran".
--
-- Six top-level categories, exactly: Food, Transport, Fun, Subscriptions,
-- Shopping (renamed from Big Buy), Other. expenses.category now stores one
-- of these six directly — spend_categories collapses from many
-- Wallet-mapped keys to exactly six self-grouped rows per user. A new
-- expenses.sub_label column carries the optional sub-label (Groceries,
-- Bike taxi, Fitness gear, etc.) the chip sets — never something typed into
-- notes.
--
-- Late tax is deleted as a concept: Transport is one flat weekly budget,
-- no separate envelope. "Paid rides" (Auto + Bike taxi spend this week)
-- replaces it as an informational line, computed in get_dashboard so the
-- UI doesn't need a second query.
--
-- October (cycle_start < 2026-10-31) keeps its old mechanics unchanged —
-- Shopping (renamed from Big Buy) stays a flat in-cap monthly budget,
-- counted in spend, same as Fun/Subscriptions/Other. Only the label
-- changed; the arithmetic didn't. From the 31 Oct 2026 cycle on, Shopping
-- has no cap-level budget at all — it's funded by shopping_accrual
-- (renamed from big_buy_accrual) into a sinking fund, split across four
-- sub-budgets that must sum to the accrual (enforced at save time in the
-- UI, not here).

begin;

-- ============================================================================
-- 1. expenses.sub_label — optional, chip-set, never required.
-- ============================================================================
alter table public.expenses
  add column if not exists sub_label text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_sub_label_check'
  ) then
    alter table public.expenses
      add constraint expenses_sub_label_check
      check (sub_label is null or sub_label in (
        'Groceries', 'Eating out', 'Snacks & drinks',
        'Public transport', 'Auto', 'Bike taxi',
        'Fitness gear', 'Football', 'Clothes & shoes', 'Electronics'
      ));
  end if;
end $$;

-- ============================================================================
-- 2. spend_month_plans.big_buy_accrual -> shopping_accrual.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'spend_month_plans' and column_name = 'big_buy_accrual'
  ) and not exists (
    select 1 from information_schema.columns
     where table_name = 'spend_month_plans' and column_name = 'shopping_accrual'
  ) then
    alter table public.spend_month_plans rename column big_buy_accrual to shopping_accrual;
  end if;
end $$;

alter table public.spend_month_plans
  add column if not exists shopping_accrual numeric(10,2) not null default 0;

-- ============================================================================
-- 3. Data migration: fine-grained keys -> six top-level categories +
-- sub-labels, then collapse spend_categories to exactly six rows per user.
-- Guarded so re-running this file is a no-op once spend_categories only
-- holds the six canonical keys — otherwise a second run would see
-- e.category already rewritten to 'Food'/'Transport'/etc, fail to match
-- any of the literal old-key cases below, and wrongly null out sub-labels
-- it already set the first time.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from public.spend_categories
     where key not in ('Food', 'Transport', 'Fun', 'Subscriptions', 'Shopping', 'Other')
  ) then

    -- Derive the new category from each expense's CURRENT group (not a
    -- hardcoded key list) so a manually-renamed or added category still
    -- lands in the right bucket. Sub-label comes from the old literal key,
    -- for the handful of keys this round gives an unambiguous sub-label;
    -- everything else gets no sub-label rather than a guessed one.
    update public.expenses e
    set category = case c."group"
          when 'Food'          then 'Food'
          when 'Transport'     then 'Transport'
          when 'Fun'           then 'Fun'
          when 'Subscriptions' then 'Subscriptions'
          when 'Big Buy'       then 'Shopping'
          when 'Other'         then 'Other'
          else e.category
        end,
        sub_label = case
          when c."group" = 'Food' and e.category = 'Groceries'
            then 'Groceries'
          when c."group" = 'Food' and e.category in ('Meals', 'Restaurant, fast-food')
            then 'Eating out'
          when c."group" = 'Food' and e.category = 'Juices, Drinks'
            then 'Snacks & drinks'
          -- Taxi was Wallet's only paid-ride key; this round's brief calls
          -- it bike-taxi by default ("unless clearly an auto" — nothing in
          -- the stored data distinguishes that, so there is no clearer
          -- signal to act on). Fuel/Parking are personal-vehicle running
          -- costs, not a paid ride, so neither maps to Auto — they get no
          -- sub-label, same as before this round's three-way split existed.
          when c."group" = 'Transport' and e.category = 'Taxi'
            then 'Bike taxi'
          when c."group" = 'Transport' and e.category = 'Public transport'
            then 'Public transport'
          when c."group" = 'Big Buy' and e.category = 'Active sport, fitness'
            then 'Fitness gear'
          when c."group" = 'Big Buy' and e.category = 'Clothes & Footwear'
            then 'Clothes & shoes'
          else null
        end
    from public.spend_categories c
    where c.user_id = e.user_id and c.key = e.category;

    delete from public.spend_categories;

    insert into public.spend_categories (user_id, key, label, emoji, kind, sort, "group", subgroup)
    select u.id, v.key, v.label, v.emoji, v.kind, v.sort, v."group", null
      from auth.users u
      cross join (values
        ('Food',          'Food',          '🍽️', 'weekly',  1, 'Food'),
        ('Transport',     'Transport',     '🛵', 'weekly',  2, 'Transport'),
        ('Fun',           'Fun',           '🎟️', 'monthly', 3, 'Fun'),
        ('Subscriptions', 'Subscriptions', '📱', 'monthly', 4, 'Subscriptions'),
        ('Shopping',      'Shopping',      '🛍️', 'monthly', 5, 'Shopping'),
        ('Other',         'Other',         '📦', 'monthly', 6, 'Other')
      ) as v(key, label, emoji, kind, sort, "group")
    on conflict (user_id, key) do nothing;

  end if;
end $$;

-- Rename any existing plan rows' "Big Buy" / "Transport:late_tax" budget
-- keys so historical cycles (October) read under the new names. Mechanics
-- unchanged — same numbers, new label — per this round's brief ("October
-- keeps its old rules"). Late tax's budget number is simply dropped: there
-- is no new home for it, since the envelope itself is gone.
update public.spend_month_plans
set category_budgets = (category_budgets - 'Big Buy' - 'Transport:late_tax')
      || jsonb_build_object('Shopping', category_budgets->'Big Buy')
where category_budgets ? 'Big Buy';

update public.spend_month_plans
set category_budgets = category_budgets - 'Transport:late_tax'
where category_budgets ? 'Transport:late_tax' and not (category_budgets ? 'Big Buy');

-- Seed function for brand-new sign-ups, rewritten for the six-category model.
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
    (target, 'Food',          'Food',          '🍽️', 'weekly',  1, 'Food',          null),
    (target, 'Transport',     'Transport',     '🛵', 'weekly',  2, 'Transport',     null),
    (target, 'Fun',           'Fun',           '🎟️', 'monthly', 3, 'Fun',           null),
    (target, 'Subscriptions', 'Subscriptions', '📱', 'monthly', 4, 'Subscriptions', null),
    (target, 'Shopping',      'Shopping',      '🛍️', 'monthly', 5, 'Shopping',      null),
    (target, 'Other',         'Other',         '📦', 'monthly', 6, 'Other',         null)
  on conflict (user_id, key) do nothing;
end;
$$;

-- ============================================================================
-- 4. get_dashboard rewrite: Shopping replaces Big Buy everywhere, late tax
-- is gone (replaced by a "paid_rides" count+total on Transport), and
-- incap_total/unassigned now include Shopping's flat budget for OLD-rules
-- cycles only (new rules keep it excluded — "Shopping is outside the cap").
-- Every category's JSON entry gains a generic `sub` breakdown: per-sub-label
-- {budget,spent,over} for Shopping (both rule sets — old rules just have no
-- sub-budgets configured, so these read as zero), and spent-only totals for
-- Food/Transport (no sub-budgets exist for those, by design).
-- ============================================================================
create or replace function public.get_dashboard(p_today date)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user           uuid := auth.uid();
  v_plan           record;
  v_prev_plan      record;
  v_weights        jsonb;
  v_adjustments    jsonb;
  v_cycle_start    date;
  v_cycle_end      date;
  v_next_payday    date;
  v_prev_start     date;
  v_prev_end       date;
  v_cap            numeric;
  v_prev_cap       numeric;
  v_hero_fund      numeric;  -- what actually feeds the day-weighted allowance
  v_prev_hero_fund numeric;
  v_new_rules      boolean;
  v_prev_new_rules boolean;
  v_week_mon       date;
  v_carry          numeric := 0;
  v_result_cats    jsonb := '{}'::jsonb;
  v_balances       jsonb := '{}'::jsonb;
  v_real_money     numeric := 0;
  v_count_bob      boolean;
  v_remaining_wks  numeric;
  v_budget_left_wk numeric;
  v_spent_this_wk  numeric;
  v_month_debt     numeric := 0;
  v_cycle_spent    numeric := 0;
  v_shopping_fund  numeric := 0;
  v_incap_total    numeric := 0;
  v_cat            record;
  v_this_week_mon  date := p_today - ((extract(isodow from p_today)::int - 1));
  v_this_week_sun  date;
  v_new_rules_start constant date := '2026-10-31';
  v_shopping_sub_labels constant text[] := array['Fitness gear', 'Football', 'Clothes & shoes', 'Electronics'];
  v_food_sub_labels     constant text[] := array['Groceries', 'Eating out', 'Snacks & drinks'];
  v_transport_sub_labels constant text[] := array['Public transport', 'Auto', 'Bike taxi'];
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  v_this_week_sun := v_this_week_mon + 6;

  v_cycle_start := case
    when p_today >= (date_trunc('month', p_today) + interval '1 month - 1 day')::date
      then (date_trunc('month', p_today) + interval '1 month - 1 day')::date
    else (date_trunc('month', p_today) - interval '1 day')::date
  end;
  v_next_payday := (date_trunc('month', v_cycle_start) + interval '2 months - 1 day')::date;
  v_cycle_end := v_next_payday - 1;
  v_new_rules := v_cycle_start >= v_new_rules_start;

  v_prev_end   := v_cycle_start - 1;
  v_prev_start := (date_trunc('month', v_prev_end) - interval '1 day')::date;
  v_prev_new_rules := v_prev_start >= v_new_rules_start;

  select * into v_plan from spend_month_plans
   where user_id = v_user and month = to_char(v_cycle_start + 1, 'YYYY-MM');

  select * into v_prev_plan from spend_month_plans
   where user_id = v_user and month = to_char(v_prev_start + 1, 'YYYY-MM');

  if v_plan is null then
    return jsonb_build_object(
      'has_plan', false,
      'cycle_start', v_cycle_start,
      'cycle_end', v_cycle_end
    );
  end if;

  v_weights := coalesce(v_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb);
  v_adjustments := coalesce(v_plan.adjustments, '{}'::jsonb);
  v_cap := greatest(0, v_plan.salary - v_plan.investments - v_plan.savings_target - v_plan.shopping_accrual);

  -- incap_total: Food/Transport weighted by the cycle's day-weight mass
  -- (not plain weeks — see 0017), plus Fun/Subscriptions/Other flat. Old
  -- rules also add Shopping's own flat budget (it's a normal in-cap
  -- category there); new rules exclude it (funded by the accrual instead).
  declare
    v_len         numeric := v_cycle_end - v_cycle_start + 1;
    v_w1          numeric := coalesce((v_weights->>'first_two')::numeric, 0.8);
    v_w2          numeric := coalesce((v_weights->>'rest')::numeric, 1.2);
    v_weight_mass numeric := least(v_len, 14) * v_w1 + greatest(v_len - 14, 0) * v_w2;
    v_food     numeric := coalesce((v_plan.category_budgets->>'Food')::numeric, 0);
    v_trans    numeric := coalesce((v_plan.category_budgets->>'Transport')::numeric, 0);
    v_fun      numeric := coalesce((v_plan.category_budgets->>'Fun')::numeric, 0);
    v_subs     numeric := coalesce((v_plan.category_budgets->>'Subscriptions')::numeric, 0);
    v_other    numeric := coalesce((v_plan.category_budgets->>'Other')::numeric, 0);
    v_shopping numeric := coalesce((v_plan.category_budgets->>'Shopping')::numeric, 0);
  begin
    v_incap_total := (v_food + v_trans) / 7.0 * v_weight_mass + v_fun + v_subs + v_other
      + case when v_new_rules then 0 else v_shopping end;
  end;
  v_hero_fund := case when v_new_rules then v_incap_total else v_cap end;

  select count_bob_as_cash into v_count_bob
    from spend_settings where user_id = v_user;
  v_count_bob := coalesce(v_count_bob, true);

  -- cycle_spent_total: the month strip's "spent vs cap" figure. Excludes
  -- Shopping under new rules — it was never funded from the cap.
  select coalesce(sum(e.amount), 0) into v_cycle_spent
    from expenses e
    left join spend_categories c on c.key = e.category and c.user_id = e.user_id
   where e.user_id = v_user and e.spent_on >= v_cycle_start and e.spent_on <= p_today
     and (not v_new_rules or c."group" is distinct from 'Shopping');

  -- Shopping fund: sum of accruals for cycles that have STARTED, from the
  -- 31 Oct 2026 cycle on, minus Shopping spend since then.
  if v_new_rules or p_today >= v_new_rules_start then
    declare
      v_accrued numeric := 0;
      v_sh_spent numeric := 0;
      v_row record;
      v_row_cycle_start date;
    begin
      for v_row in
        select month, shopping_accrual from spend_month_plans
         where user_id = v_user and month >= '2026-11'
      loop
        v_row_cycle_start := (to_date(v_row.month || '-01', 'YYYY-MM-DD') - interval '1 day')::date;
        if v_row_cycle_start <= p_today then
          v_accrued := v_accrued + coalesce(v_row.shopping_accrual, 0);
        end if;
      end loop;

      select coalesce(sum(e.amount), 0) into v_sh_spent
        from expenses e join spend_categories c on c.key = e.category and c.user_id = e.user_id
       where e.user_id = v_user and c."group" = 'Shopping'
         and e.spent_on >= v_new_rules_start and e.spent_on <= p_today;

      v_shopping_fund := v_accrued - v_sh_spent;
    end;
  end if;

  if v_prev_plan is not null then
    v_prev_cap := greatest(0, v_prev_plan.salary - v_prev_plan.investments
                             - v_prev_plan.savings_target - v_prev_plan.shopping_accrual);
    if v_prev_new_rules then
      declare
        v_len         numeric := v_prev_end - v_prev_start + 1;
        v_w1          numeric := coalesce((coalesce(v_prev_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb)->>'first_two')::numeric, 0.8);
        v_w2          numeric := coalesce((coalesce(v_prev_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb)->>'rest')::numeric, 1.2);
        v_weight_mass numeric := least(v_len, 14) * v_w1 + greatest(v_len - 14, 0) * v_w2;
        v_food  numeric := coalesce((v_prev_plan.category_budgets->>'Food')::numeric, 0);
        v_trans numeric := coalesce((v_prev_plan.category_budgets->>'Transport')::numeric, 0);
        v_fun   numeric := coalesce((v_prev_plan.category_budgets->>'Fun')::numeric, 0);
        v_subs  numeric := coalesce((v_prev_plan.category_budgets->>'Subscriptions')::numeric, 0);
        v_other numeric := coalesce((v_prev_plan.category_budgets->>'Other')::numeric, 0);
      begin
        -- Shopping is always excluded here: this branch only runs when the
        -- PREVIOUS cycle was itself new-rules, and new rules never fund the
        -- hero from Shopping.
        v_prev_hero_fund := (v_food + v_trans) / 7.0 * v_weight_mass + v_fun + v_subs + v_other;
      end;
    else
      v_prev_hero_fund := v_prev_cap;
    end if;

    v_carry := public._spend_cycle_carry(
      v_user, v_prev_start, v_prev_end, v_prev_end, v_prev_hero_fund,
      coalesce(v_prev_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb),
      v_prev_new_rules
    );
    if v_carry > 0 then
      v_carry := 0;
    end if;
  end if;

  v_week_mon := v_cycle_start - ((extract(isodow from v_cycle_start)::int - 1));
  while v_week_mon <= v_this_week_mon loop
    declare
      v_week_sun       date := v_week_mon + 6;
      v_raw            numeric;
      v_spent          numeric;
      v_is_current     boolean := (v_week_mon = v_this_week_mon);
      v_effective_in   numeric;
      v_leftover       numeric;
    begin
      v_raw := public._spend_week_allowance(v_week_mon, v_week_sun, v_cycle_start, v_cycle_end, v_hero_fund, v_weights);

      select coalesce(sum(e.amount), 0) into v_spent
        from expenses e
        left join spend_categories c on c.key = e.category and c.user_id = e.user_id
       where e.user_id = v_user
         and e.spent_on >= greatest(v_week_mon, v_cycle_start)
         and e.spent_on <= least(case when v_is_current then p_today else v_week_sun end, v_cycle_end)
         and (not v_new_rules or c."group" is distinct from 'Shopping');

      if v_carry < 0 then
        v_effective_in := greatest(v_carry, -0.3 * v_raw);
      else
        v_effective_in := v_carry;
      end if;
      v_leftover := v_carry - v_effective_in;

      if v_is_current then
        v_budget_left_wk := v_raw + v_effective_in - v_spent;
        v_spent_this_wk := v_spent;
      else
        v_carry := (v_raw + v_effective_in - v_spent) + v_leftover;
      end if;
    end;
    v_week_mon := v_week_mon + 7;
  end loop;

  if v_carry < 0 then
    v_month_debt := -v_carry;
  end if;

  for v_cat in
    select distinct on (account) account, amount, snapshot_at
      from spend_balances
     where user_id = v_user
     order by account, snapshot_at desc
  loop
    declare
      v_spent_since numeric;
      v_current     numeric;
    begin
      select coalesce(sum(amount), 0) into v_spent_since
        from expenses
       where user_id = v_user
         and account = v_cat.account
         and coalesce(source_ts, created_at) > v_cat.snapshot_at;

      v_current := v_cat.amount - v_spent_since;
      v_balances := v_balances || jsonb_build_object(v_cat.account, round(v_current, 2));

      if v_cat.account in ('Apex', 'Cash') or (v_cat.account = 'BOB' and v_count_bob) then
        v_real_money := v_real_money + v_current;
      end if;
    end;
  end loop;

  -- Shopping fund sits in BOB but isn't spendable — a negative fund
  -- (overspent against future accrual) never ADDS money back.
  v_real_money := v_real_money - greatest(v_shopping_fund, 0);

  v_remaining_wks := ceil((v_cycle_end - p_today + 1) / 7.0);
  if v_remaining_wks < 1 then
    v_remaining_wks := 1;
  end if;

  for v_cat in
    select "group" as bucket, kind, min(sort) as sort
      from spend_categories
     where user_id = v_user and "group" is not null
     group by "group", kind
  loop
    declare
      v_budget  numeric;
      v_spent   numeric;
      v_day     int := p_today - v_cycle_start + 1;
      v_len     int := v_cycle_end - v_cycle_start + 1;
      v_pace    numeric;
      v_sub     jsonb := null;
      v_paid_rides jsonb := null;
      v_adj     numeric := coalesce((v_adjustments->>v_cat.bucket)::numeric, 0);
      v_is_shopping boolean := (v_cat.bucket = 'Shopping');
    begin
      -- Shopping's four sub-budgets, computed the same way regardless of
      -- old/new rules — October's plan row simply has none configured, so
      -- these read as a budget of 0 against whatever was actually spent.
      if v_is_shopping then
        declare
          v_sub_label text;
          v_sub_budget numeric;
          v_sub_spent numeric;
          v_sub_obj jsonb := '{}'::jsonb;
        begin
          foreach v_sub_label in array v_shopping_sub_labels loop
            v_sub_budget := coalesce((v_plan.category_budgets->>('Shopping:' || v_sub_label))::numeric, 0);
            select coalesce(sum(amount), 0) into v_sub_spent
              from expenses
             where user_id = v_user and category = 'Shopping' and sub_label = v_sub_label
               and spent_on >= v_cycle_start and spent_on <= p_today;
            v_sub_obj := v_sub_obj || jsonb_build_object(v_sub_label, jsonb_build_object(
              'budget', round(v_sub_budget, 2),
              'spent', round(v_sub_spent, 2),
              'over', v_sub_spent > v_sub_budget
            ));
          end loop;
          v_sub := v_sub_obj;
        end;

        if v_new_rules then
          select coalesce(sum(e.amount), 0) into v_spent
            from expenses e join spend_categories c on c.key = e.category and c.user_id = e.user_id
           where e.user_id = v_user and c."group" = 'Shopping'
             and e.spent_on >= v_cycle_start and e.spent_on <= p_today;
          v_result_cats := v_result_cats || jsonb_build_object(
            'Shopping', jsonb_build_object(
              'budget', round(greatest(v_shopping_fund, 0), 2),
              'spent', round(v_spent, 2),
              'pace', round(greatest(v_shopping_fund, 0), 2),
              'over', v_spent > greatest(v_shopping_fund, 0),
              'kind', 'fund',
              'sub', v_sub
            )
          );
          continue;
        end if;
        -- Old rules fall through to the normal monthly branch below, same
        -- as Fun/Subscriptions/Other — Shopping is just another in-cap
        -- category for cycles before 31 Oct 2026.
      end if;

      if v_cat.kind = 'weekly' then
        v_budget := public._spend_weekly_rate_budget(
          v_this_week_mon, v_this_week_sun, v_cycle_start,
          coalesce((v_plan.category_budgets->>v_cat.bucket)::numeric, 0), v_weights
        ) + v_adj;
        select coalesce(sum(e.amount), 0) into v_spent
          from expenses e join spend_categories c
            on c.key = e.category and c.user_id = e.user_id
         where e.user_id = v_user and c."group" = v_cat.bucket
           and e.spent_on >= v_this_week_mon and e.spent_on <= p_today;
        v_pace := v_budget;
      else
        v_budget := coalesce((v_plan.category_budgets->>v_cat.bucket)::numeric, 0) + v_adj;
        select coalesce(sum(e.amount), 0) into v_spent
          from expenses e join spend_categories c
            on c.key = e.category and c.user_id = e.user_id
         where e.user_id = v_user and c."group" = v_cat.bucket
           and e.spent_on >= v_cycle_start and e.spent_on <= p_today;
        v_pace := v_budget * (v_day::numeric / greatest(v_len, 1));
      end if;

      -- Food/Transport: spent-only sub-label totals for this week (no
      -- sub-budgets exist for these two — just an informational line).
      if v_cat.bucket = 'Food' or v_cat.bucket = 'Transport' then
        declare
          v_labels text[] := case when v_cat.bucket = 'Food' then v_food_sub_labels else v_transport_sub_labels end;
          v_label text;
          v_label_spent numeric;
          v_sub_obj jsonb := '{}'::jsonb;
        begin
          foreach v_label in array v_labels loop
            select coalesce(sum(amount), 0) into v_label_spent
              from expenses
             where user_id = v_user and category = v_cat.bucket and sub_label = v_label
               and spent_on >= v_this_week_mon and spent_on <= p_today;
            if v_label_spent > 0 then
              v_sub_obj := v_sub_obj || jsonb_build_object(v_label, round(v_label_spent, 2));
            end if;
          end loop;
          v_sub := v_sub_obj;
        end;
      end if;

      -- "Paid rides" — Transport's replacement for the old late-tax
      -- envelope: how much of this week's Transport spend was a paid ride
      -- (Auto or Bike taxi) rather than public transport, informational
      -- only, no budget of its own.
      if v_cat.bucket = 'Transport' then
        declare
          v_count int;
          v_total numeric;
        begin
          select count(*), coalesce(sum(amount), 0) into v_count, v_total
            from expenses
           where user_id = v_user and category = 'Transport'
             and sub_label in ('Auto', 'Bike taxi')
             and spent_on >= v_this_week_mon and spent_on <= p_today;
          v_paid_rides := jsonb_build_object('count', v_count, 'total', round(v_total, 2));
        end;
      end if;

      v_result_cats := v_result_cats || jsonb_build_object(
        v_cat.bucket, jsonb_build_object(
          'budget', round(v_budget, 2),
          'spent', round(v_spent, 2),
          'pace', round(v_pace, 2),
          'over', v_spent > v_budget,
          'kind', v_cat.kind,
          'sub', v_sub,
          'paid_rides', v_paid_rides
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'has_plan', true,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end,
    'new_rules', v_new_rules,
    'discretionary_cap', round(v_cap, 2),
    'incap_total', round(v_incap_total, 2),
    'unassigned', round(v_cap - v_incap_total, 2),
    'shopping_fund', round(v_shopping_fund, 2),
    'cycle_spent_total', round(v_cycle_spent, 2),
    'month_debt', round(v_month_debt, 2),
    'budget_left_this_week', round(v_budget_left_wk, 2),
    'spent_this_week', round(v_spent_this_wk, 2),
    'real_money_left', round(v_real_money, 2),
    'remaining_weeks', v_remaining_wks,
    'cash_left_this_week', round(v_real_money / v_remaining_wks, 2),
    'binding', case when (v_real_money / v_remaining_wks) < v_budget_left_wk then 'cash' else 'budget' end,
    'balances', v_balances,
    'count_bob_as_cash', v_count_bob,
    'categories', v_result_cats
  );
end;
$$;

commit;
