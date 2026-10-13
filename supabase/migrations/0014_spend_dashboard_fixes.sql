-- Afterburner 0014 — get_dashboard bug fixes, found against real data.
--
-- 1. cycle_end off-by-one. next_payday was computed correctly (last day of
--    the month after cycle_start's month) but then used directly AS
--    cycle_end instead of next_payday minus one day, so a cycle that should
--    end the day before the next payday instead ran straight through it.
--    Sept 30 cycle_start produced cycle_end = Oct 31 (the NEXT payday
--    itself) instead of Oct 30.
--
-- 2. count_bob_as_cash came back null. `select ... into v_count_bob` always
--    overwrites the target, including to NULL when zero rows match — the
--    variable's `:= true` default only applies before the first assignment,
--    not when a SELECT INTO matches nothing. A user with no spend_settings
--    row (true here: the only remaining writer is the BOB-toggle checkbox,
--    which this user hadn't touched) got NULL instead of falling back.
--
-- 3. Weekly-category (Food, Transport) budgets used TODAY's single
--    day-of-cycle weight for the entire week, instead of blending each of
--    the week's seven days by its own weight. A week straddling day 14/15
--    of the cycle should mix 0.8 and 1.2; it was getting one flat multiplier
--    depending only on which side of the boundary today happened to fall.
--
-- 4. discretionary_cap read as 0 for a plan the user confirms has real
--    numbers. I could not reproduce or isolate this one by re-reading the
--    SQL — the formula and the month-key resolution both check out against
--    the user's own dates. Added raw diagnostic fields (plan_month, and the
--    four input numbers as actually read) so the next run makes the cause
--    visible instead of guessing further.
--
-- Also: "This week's move" moves money for the current cycle only now, not
-- the reusable plan template — see the new `adjustments` column.

alter table public.spend_month_plans
  add column if not exists adjustments jsonb not null default '{}';

create or replace function public._spend_weekly_rate_budget(
  p_week_mon date, p_week_sun date, p_cycle_start date,
  p_per_week_rate numeric, p_weights jsonb
) returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric := 0;
  v_d     date;
  v_day   int;
  v_w     numeric;
begin
  for v_d in select generate_series(p_week_mon, p_week_sun, interval '1 day')::date loop
    v_day := v_d - p_cycle_start + 1;
    v_w := case when v_day <= 14 then (p_weights->>'first_two')::numeric else (p_weights->>'rest')::numeric end;
    v_total := v_total + v_w;
  end loop;
  -- Each of the week's 7 days gets 1/7 of the rate, scaled by that day's own
  -- weight — so a 4-day-at-0.8 / 3-day-at-1.2 week blends both, instead of
  -- today's single weight applying to the whole week.
  return p_per_week_rate / 7 * v_total;
end;
$$;

grant execute on function public._spend_weekly_rate_budget(date, date, date, numeric, jsonb) to authenticated;

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
  v_cat            record;
  v_this_week_mon  date := p_today - ((extract(isodow from p_today)::int - 1));
  v_this_week_sun  date;
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
  -- Fix 1: cycle_end is the day BEFORE the next payday, not the payday itself.
  v_next_payday := (date_trunc('month', v_cycle_start) + interval '2 months - 1 day')::date;
  v_cycle_end := v_next_payday - 1;

  v_prev_end   := v_cycle_start - 1;
  v_prev_start := (date_trunc('month', v_prev_end) - interval '1 day')::date;

  select * into v_plan from spend_month_plans
   where user_id = v_user and month = to_char(v_cycle_start + 1, 'YYYY-MM');

  select * into v_prev_plan from spend_month_plans
   where user_id = v_user and month = to_char(v_prev_start + 1, 'YYYY-MM');

  if v_plan is null then
    return jsonb_build_object(
      'has_plan', false,
      'cycle_start', v_cycle_start,
      'cycle_end', v_cycle_end,
      'plan_month_sought', to_char(v_cycle_start + 1, 'YYYY-MM')
    );
  end if;

  v_weights := coalesce(v_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb);
  v_adjustments := coalesce(v_plan.adjustments, '{}'::jsonb);
  v_cap := greatest(0, v_plan.salary - v_plan.investments - v_plan.savings_target - v_plan.buffer);

  -- Fix 2: coalesce AFTER the select, since "select into" overwrites the
  -- variable to NULL (not its declared default) when no row matches.
  select count_bob_as_cash into v_count_bob
    from spend_settings where user_id = v_user;
  v_count_bob := coalesce(v_count_bob, true);

  select coalesce(sum(amount), 0) into v_cycle_spent
    from expenses
   where user_id = v_user and spent_on >= v_cycle_start and spent_on <= p_today;

  if v_prev_plan is not null then
    v_prev_cap := greatest(0, v_prev_plan.salary - v_prev_plan.investments
                             - v_prev_plan.savings_target - v_prev_plan.buffer);
    v_carry := public._spend_cycle_carry(
      v_user, v_prev_start, v_prev_end, v_prev_end, v_prev_cap,
      coalesce(v_prev_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb)
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
      v_raw := public._spend_week_allowance(v_week_mon, v_week_sun, v_cycle_start, v_cycle_end, v_cap, v_weights);

      select coalesce(sum(amount), 0) into v_spent
        from expenses
       where user_id = v_user
         and spent_on >= greatest(v_week_mon, v_cycle_start)
         and spent_on <= least(case when v_is_current then p_today else v_week_sun end, v_cycle_end);

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
    begin
      if v_cat.kind = 'weekly' then
        -- Fix 3: blend per-day weights across the whole display week instead
        -- of multiplying by today's single weight.
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
    'discretionary_cap', round(v_cap, 2),
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
    'categories', v_result_cats,
    -- Diagnostics for bug 4 — remove once confirmed fixed.
    'debug_plan_month', to_char(v_cycle_start + 1, 'YYYY-MM'),
    'debug_salary', v_plan.salary,
    'debug_investments', v_plan.investments,
    'debug_savings_target', v_plan.savings_target,
    'debug_buffer', v_plan.buffer
  );
end;
$$;
