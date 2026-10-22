-- Afterburner 0016 — spend sprint: balances grant, Big Buy sinking fund,
-- Monday transfer tick, emotion tags. Idempotent — safe to run more than
-- once. Run this whole file in one go in the Supabase SQL Editor.

begin;

-- ============================================================================
-- ITEM 1 — balances grant. Harmless if already present; the two code-level
-- theories (column name, casing) were both ruled out, so this closes the
-- one remaining untested theory (missing table-level GRANT alongside a
-- correct RLS policy — both are required for an operation to succeed).
-- ============================================================================
grant select, insert, update, delete on public.spend_balances to authenticated;

-- ============================================================================
-- ITEM 3 — Big Buy sinking fund: rename buffer -> big_buy_accrual.
-- Same slot in the cap formula (cap = salary - investments - savings -
-- big_buy_accrual), renamed because it's no longer a generic fixed outflow:
-- it's what accrues into the Big Buy fund every cycle.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'spend_month_plans' and column_name = 'buffer'
  ) and not exists (
    select 1 from information_schema.columns
     where table_name = 'spend_month_plans' and column_name = 'big_buy_accrual'
  ) then
    alter table public.spend_month_plans rename column buffer to big_buy_accrual;
  end if;
end $$;

-- Belt and braces: if neither column exists (a from-scratch environment),
-- add it with the schema's original default.
alter table public.spend_month_plans
  add column if not exists big_buy_accrual numeric(10,2) not null default 0;

-- ============================================================================
-- ITEM 4 — Monday transfer tick. One row per user per ISO week; its mere
-- existence means "ticked". No row = not yet ticked (and, before Monday of
-- that week, the card simply doesn't show — no row needed to represent that).
-- ============================================================================
create table if not exists public.spend_transfers (
  user_id    uuid        not null references auth.users on delete cascade,
  week_mon   date        not null,
  ticked_at  timestamptz not null default now(),
  primary key (user_id, week_mon)
);

alter table public.spend_transfers enable row level security;

drop policy if exists "own spend_transfers" on public.spend_transfers;
create policy "own spend_transfers" on public.spend_transfers
  for all
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- ITEM 7 — emotion tags on Fun and Big Buy entries. Nullable: optional,
-- one tap, and most entries (Food, Transport, Subscriptions, Other) never
-- show the prompt at all.
-- ============================================================================
alter table public.expenses
  add column if not exists emotion text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_emotion_check'
  ) then
    alter table public.expenses
      add constraint expenses_emotion_check
      check (emotion is null or emotion in ('bored', 'lonely', 'celebrating', 'punishing'));
  end if;
end $$;

-- ============================================================================
-- get_dashboard rewrite. Two rule sets, chosen per cycle by its own
-- cycle_start:
--   OLD (cycle_start < 2026-10-31): unchanged. Hero funded by the flat cap;
--     Big Buy counts in v_spent and the month-strip cap comparison. The
--     October cycle's carry-over must not change, and it doesn't — the cap
--     formula is the same arithmetic on a renamed column.
--   NEW (cycle_start >= 2026-10-31): hero funded by the sum of in-cap
--     category budgets only (Food/Transport's own weekly rate, scaled
--     linearly by weeks-in-cycle with NO day-weighting applied yet — that
--     weighting is applied exactly once, by _spend_week_allowance, same as
--     the old cap was; applying it twice would double-discount early-cycle
--     days). Big Buy has no in-cap budget and is excluded from both v_spent
--     and cycle_spent_total. Its own bar shows the accrued fund instead.
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
  v_big_buy_fund   numeric := 0;
  v_incap_total    numeric := 0;
  v_cat            record;
  v_this_week_mon  date := p_today - ((extract(isodow from p_today)::int - 1));
  v_this_week_sun  date;
  v_new_rules_start constant date := '2026-10-31';
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
  v_cap := greatest(0, v_plan.salary - v_plan.investments - v_plan.savings_target - v_plan.big_buy_accrual);

  -- New rules: the hero is funded by in-cap category budgets only, not the
  -- flat cap. Food/Transport contribute their nominal weekly rate scaled
  -- linearly by weeks-in-cycle (unweighted — _spend_week_allowance applies
  -- the day curve once, below, to this whole total).
  if v_new_rules then
    declare
      v_weeks_in_cycle numeric := (v_cycle_end - v_cycle_start + 1) / 7.0;
      v_food  numeric := coalesce((v_plan.category_budgets->>'Food')::numeric, 0);
      v_trans numeric := coalesce((v_plan.category_budgets->>'Transport')::numeric, 0);
      v_fun   numeric := coalesce((v_plan.category_budgets->>'Fun')::numeric, 0);
      v_subs  numeric := coalesce((v_plan.category_budgets->>'Subscriptions')::numeric, 0);
      v_other numeric := coalesce((v_plan.category_budgets->>'Other')::numeric, 0);
      v_late  numeric := coalesce((v_plan.category_budgets->>'Transport:late_tax')::numeric, 0);
    begin
      v_incap_total := (v_food + v_trans) * v_weeks_in_cycle + v_fun + v_subs + v_other + v_late;
    end;
    v_hero_fund := v_incap_total;
  else
    v_hero_fund := v_cap;
  end if;

  select count_bob_as_cash into v_count_bob
    from spend_settings where user_id = v_user;
  v_count_bob := coalesce(v_count_bob, true);

  -- cycle_spent_total: the month strip's "spent vs cap" figure. Excludes
  -- Big Buy under new rules — it was never funded from the cap, so counting
  -- it here would make the strip compare apples to oranges.
  select coalesce(sum(e.amount), 0) into v_cycle_spent
    from expenses e
    left join spend_categories c on c.key = e.category and c.user_id = e.user_id
   where e.user_id = v_user and e.spent_on >= v_cycle_start and e.spent_on <= p_today
     and (not v_new_rules or c."group" is distinct from 'Big Buy');

  -- Big Buy fund: sum of accruals for cycles that have STARTED, from the
  -- 31 Oct 2026 cycle on, minus Big Buy spend since then. A plan row for a
  -- future month (cycle not yet begun) must not credit early.
  if v_new_rules or p_today >= v_new_rules_start then
    declare
      v_accrued numeric := 0;
      v_bb_spent numeric := 0;
      v_row record;
      v_row_cycle_start date;
    begin
      for v_row in
        select month, big_buy_accrual from spend_month_plans
         where user_id = v_user and month >= '2026-11'
      loop
        v_row_cycle_start := (to_date(v_row.month || '-01', 'YYYY-MM-DD') - interval '1 day')::date;
        if v_row_cycle_start <= p_today then
          v_accrued := v_accrued + coalesce(v_row.big_buy_accrual, 0);
        end if;
      end loop;

      select coalesce(sum(e.amount), 0) into v_bb_spent
        from expenses e join spend_categories c on c.key = e.category and c.user_id = e.user_id
       where e.user_id = v_user and c."group" = 'Big Buy'
         and e.spent_on >= v_new_rules_start and e.spent_on <= p_today;

      v_big_buy_fund := v_accrued - v_bb_spent;
    end;
  end if;

  if v_prev_plan is not null then
    v_prev_cap := greatest(0, v_prev_plan.salary - v_prev_plan.investments
                             - v_prev_plan.savings_target - v_prev_plan.big_buy_accrual);
    if v_prev_new_rules then
      declare
        v_weeks numeric := (v_prev_end - v_prev_start + 1) / 7.0;
        v_food  numeric := coalesce((v_prev_plan.category_budgets->>'Food')::numeric, 0);
        v_trans numeric := coalesce((v_prev_plan.category_budgets->>'Transport')::numeric, 0);
        v_fun   numeric := coalesce((v_prev_plan.category_budgets->>'Fun')::numeric, 0);
        v_subs  numeric := coalesce((v_prev_plan.category_budgets->>'Subscriptions')::numeric, 0);
        v_other numeric := coalesce((v_prev_plan.category_budgets->>'Other')::numeric, 0);
        v_late  numeric := coalesce((v_prev_plan.category_budgets->>'Transport:late_tax')::numeric, 0);
      begin
        v_prev_hero_fund := (v_food + v_trans) * v_weeks + v_fun + v_subs + v_other + v_late;
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
         and (not v_new_rules or c."group" is distinct from 'Big Buy');

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

  -- Big Buy fund sits in BOB but isn't spendable — a negative fund (overspent
  -- against future accrual) never ADDS money back.
  v_real_money := v_real_money - greatest(v_big_buy_fund, 0);

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
      v_late    jsonb := null;
      v_adj     numeric := coalesce((v_adjustments->>v_cat.bucket)::numeric, 0);
      v_is_big_buy boolean := (v_cat.bucket = 'Big Buy');
    begin
      if v_is_big_buy and v_new_rules then
        -- Big Buy's bar shows the accrued fund available, not a budget —
        -- it has none under new rules.
        select coalesce(sum(e.amount), 0) into v_spent
          from expenses e join spend_categories c on c.key = e.category and c.user_id = e.user_id
         where e.user_id = v_user and c."group" = 'Big Buy'
           and e.spent_on >= v_cycle_start and e.spent_on <= p_today;
        v_result_cats := v_result_cats || jsonb_build_object(
          'Big Buy', jsonb_build_object(
            'budget', round(greatest(v_big_buy_fund, 0), 2),
            'spent', round(v_spent, 2),
            'pace', round(greatest(v_big_buy_fund, 0), 2),
            'over', v_spent > greatest(v_big_buy_fund, 0),
            'kind', 'fund',
            'late_tax', null
          )
        );
        continue;
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

      if v_cat.bucket = 'Transport' then
        declare
          v_late_budget numeric := coalesce((v_plan.category_budgets->>'Transport:late_tax')::numeric, 1500);
          v_late_spent  numeric;
        begin
          select coalesce(sum(amount), 0) into v_late_spent
            from expenses
           where user_id = v_user and category = 'Taxi'
             and spent_on >= v_cycle_start and spent_on <= p_today;
          v_late := jsonb_build_object(
            'budget', v_late_budget, 'spent', v_late_spent,
            'over', v_late_spent > v_late_budget
          );
        end;
      end if;

      v_result_cats := v_result_cats || jsonb_build_object(
        v_cat.bucket, jsonb_build_object(
          'budget', round(v_budget, 2),
          'spent', round(v_spent, 2),
          'pace', round(v_pace, 2),
          'over', v_spent > v_budget,
          'kind', v_cat.kind,
          'late_tax', v_late
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
    'big_buy_fund', round(v_big_buy_fund, 2),
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

-- _spend_cycle_carry gains a p_exclude_big_buy flag so a prior NEW-rules
-- cycle's own carry computation excludes Big Buy spend consistently with
-- how its live cycle would have. CREATE OR REPLACE cannot add a parameter
-- to an existing function — Postgres treats a different argument count as
-- a different signature, which would leave the old 6-arg overload as dead
-- code rather than truly replacing it — so the old signature is dropped
-- explicitly first.
drop function if exists public._spend_cycle_carry(uuid, date, date, date, numeric, jsonb);

create or replace function public._spend_cycle_carry(
  p_user uuid, p_cycle_start date, p_cycle_end date, p_as_of date,
  p_cap numeric, p_weights jsonb, p_exclude_big_buy boolean default false
) returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_week_mon  date := p_cycle_start - ((extract(isodow from p_cycle_start)::int - 1));
  v_carry     numeric := 0;
begin
  while v_week_mon <= p_cycle_end and v_week_mon <= p_as_of loop
    declare
      v_week_sun     date := v_week_mon + 6;
      v_raw          numeric;
      v_spent        numeric;
      v_effective_in numeric;
      v_leftover     numeric;
      v_end_of_week  date := least(v_week_sun, p_as_of, p_cycle_end);
    begin
      v_raw := public._spend_week_allowance(v_week_mon, v_week_sun, p_cycle_start, p_cycle_end, p_cap, p_weights);

      select coalesce(sum(e.amount), 0) into v_spent
        from expenses e
        left join spend_categories c on c.key = e.category and c.user_id = e.user_id
       where e.user_id = p_user
         and e.spent_on >= greatest(v_week_mon, p_cycle_start)
         and e.spent_on <= v_end_of_week
         and (not p_exclude_big_buy or c."group" is distinct from 'Big Buy');

      if v_carry < 0 then
        v_effective_in := greatest(v_carry, -0.3 * v_raw);
      else
        v_effective_in := v_carry;
      end if;
      v_leftover := v_carry - v_effective_in;
      v_carry := (v_raw + v_effective_in - v_spent) + v_leftover;
    end;
    v_week_mon := v_week_mon + 7;
  end loop;
  return v_carry;
end;
$$;

grant execute on function public._spend_cycle_carry(uuid, date, date, date, numeric, jsonb, boolean) to authenticated;

commit;
