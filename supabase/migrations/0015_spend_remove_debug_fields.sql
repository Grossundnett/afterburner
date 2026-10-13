-- Afterburner 0015 — remove the debug_* fields added in 0014.
--
-- Root cause of the discretionary_cap-reads-0 bug (and the two plan-save
-- bugs reported alongside it) was never in this function: the plan page's
-- NumInput fields accepted Indian comma grouping (1,00,505) but parsed with
-- a bare Number(), which returns NaN on a comma and silently fell back to 0
-- via `|| 0` — so salary/investments/savings_target/buffer, and every
-- balance snapshot, saved as zero while small category figures (1440, 3000,
-- no commas needed) went through untouched. Fixed client-side in
-- src/lib/money.ts; nothing here was ever wrong. Debug fields removed now
-- that the real cause is confirmed.

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
      'cycle_end', v_cycle_end
    );
  end if;

  v_weights := coalesce(v_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb);
  v_adjustments := coalesce(v_plan.adjustments, '{}'::jsonb);
  v_cap := greatest(0, v_plan.salary - v_plan.investments - v_plan.savings_target - v_plan.buffer);

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
    'categories', v_result_cats
  );
end;
$$;
