-- Afterburner 0012 — get_dashboard(p_today date): the one-RPC home screen.
--
-- Returns everything /spend's home screen needs in a single round trip:
-- payday cycle dates, day-weighted allowance, carry-over (recomputed live
-- from expense history every call, never stored, so it can't drift out of
-- sync with reality), spent-this-week, real money left, the binding
-- constraint, and per-bucket {budget, spent, pace, over}.
--
-- security invoker, not definer: it only ever sees the calling user's own
-- rows, same as every other table here, via auth.uid().

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
  v_cycle_start    date;
  v_cycle_end      date;
  v_prev_start     date;
  v_prev_end       date;
  v_cap            numeric;
  v_prev_cap       numeric;
  v_week_mon       date;
  v_carry          numeric := 0;
  v_result_cats    jsonb := '{}'::jsonb;
  v_balances       jsonb := '{}'::jsonb;
  v_real_money     numeric := 0;
  v_count_bob      boolean := true;
  v_remaining_wks  numeric;
  v_budget_left_wk numeric;
  v_spent_this_wk  numeric;
  v_month_debt     numeric := 0;
  v_cat            record;
  v_this_week_mon  date := p_today - ((extract(isodow from p_today)::int - 1));
  v_this_week_sun  date;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  v_this_week_sun := v_this_week_mon + 6;

  -- -------------------------------------------------------------------------
  -- 1. Payday cycle: payday = last calendar day of the month. The cycle runs
  --    from a payday to the day before the next one. Using date_trunc gives a
  --    day=1 anchor for every month-interval add below, so Postgres's
  --    end-of-month interval clamping (which corrupts "Jan 31 + 1 month")
  --    never comes into play.
  -- -------------------------------------------------------------------------
  v_cycle_start := case
    when p_today >= (date_trunc('month', p_today) + interval '1 month - 1 day')::date
      then (date_trunc('month', p_today) + interval '1 month - 1 day')::date
    else (date_trunc('month', p_today) - interval '1 day')::date
  end;
  v_cycle_end := (date_trunc('month', v_cycle_start) + interval '2 months - 1 day')::date;

  v_prev_end   := v_cycle_start - 1;
  v_prev_start := (date_trunc('month', v_prev_end) - interval '1 day')::date;

  -- -------------------------------------------------------------------------
  -- 2. The plan row governing this cycle is keyed by the calendar month the
  --    bulk of the cycle falls in — the day right after cycle_start, which is
  --    always the 1st of that month since cycle_start is itself a month-end.
  -- -------------------------------------------------------------------------
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
  v_cap := greatest(0, v_plan.salary - v_plan.investments - v_plan.savings_target - v_plan.buffer);

  select coalesce(count_bob_as_cash, true) into v_count_bob
    from spend_settings where user_id = v_user;

  -- -------------------------------------------------------------------------
  -- 3. Month debt carried in from the previous cycle: walk that cycle's
  --    weeks the same way as the main loop below, but only to find its final
  --    leftover deficit (if any plan existed for it). One cycle back only —
  --    debt doesn't telescope further than that.
  -- -------------------------------------------------------------------------
  if v_prev_plan is not null then
    v_prev_cap := greatest(0, v_prev_plan.salary - v_prev_plan.investments
                             - v_prev_plan.savings_target - v_prev_plan.buffer);
    v_carry := public._spend_cycle_carry(
      v_user, v_prev_start, v_prev_end, v_prev_end, v_prev_cap,
      coalesce(v_prev_plan.week_weights, '{"first_two":0.8,"rest":1.2}'::jsonb)
    );
    if v_carry > 0 then
      v_carry := 0; -- surplus does not cross a cycle boundary, only debt does
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. Walk this cycle's weeks up to and including the current (partial)
  --    week, carrying surplus/deficit forward. A deficit applied to any one
  --    week is capped at 30% of that week's own raw allowance; whatever a
  --    week can't absorb keeps carrying to the next.
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- 5. Real money left: latest balance snapshot per account minus whatever
  --    has been spent against that account since the snapshot.
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- 6. Per-bucket budget/spent/pace/over, cycle-to-date. Weekly buckets
  --    (Food, Transport) use this week's allowance as the budget; monthly
  --    buckets use the flat cycle budget. Transport's late-tax envelope is a
  --    nested sub-stat, not a 7th bucket.
  -- -------------------------------------------------------------------------
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
    begin
      if v_cat.kind = 'weekly' then
        v_budget := coalesce((v_plan.category_budgets->>v_cat.bucket)::numeric, 0)
                    * case when v_day <= 14 then (v_weights->>'first_two')::numeric
                                             else (v_weights->>'rest')::numeric end;
        select coalesce(sum(e.amount), 0) into v_spent
          from expenses e join spend_categories c
            on c.key = e.category and c.user_id = e.user_id
         where e.user_id = v_user and c."group" = v_cat.bucket
           and e.spent_on >= v_this_week_mon and e.spent_on <= p_today;
        v_pace := v_budget; -- already this-week's slice; pace = full week budget
      else
        v_budget := coalesce((v_plan.category_budgets->>v_cat.bucket)::numeric, 0);
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

grant execute on function public.get_dashboard(date) to authenticated;

-- -----------------------------------------------------------------------------
-- Helper: one week's raw (pre-carry) allowance, clipped to the cycle's bounds
-- and day-weighted. Shared by the main function and the previous-cycle debt
-- pass, so the two can't drift apart.
-- -----------------------------------------------------------------------------
create or replace function public._spend_week_allowance(
  p_week_mon date, p_week_sun date, p_cycle_start date, p_cycle_end date,
  p_cap numeric, p_weights jsonb
) returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_len   int := p_cycle_end - p_cycle_start + 1;
  v_total numeric := 0;
  v_raw   numeric := 0;
  v_d     date;
  v_day   int;
  v_w     numeric;
begin
  for v_d in select generate_series(p_cycle_start, p_cycle_end, interval '1 day')::date loop
    v_day := v_d - p_cycle_start + 1;
    v_w := case when v_day <= 14 then (p_weights->>'first_two')::numeric else (p_weights->>'rest')::numeric end;
    v_total := v_total + v_w;
    if v_d >= p_week_mon and v_d <= p_week_sun then
      v_raw := v_raw + v_w;
    end if;
  end loop;
  if v_total = 0 then
    return 0;
  end if;
  return p_cap * v_raw / v_total;
end;
$$;

grant execute on function public._spend_week_allowance(date, date, date, date, numeric, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Helper: final carry-out (surplus or deficit) for one fully-elapsed cycle,
-- used only to seed next cycle's month-debt. Mirrors the main loop's rules.
-- -----------------------------------------------------------------------------
create or replace function public._spend_cycle_carry(
  p_user uuid, p_cycle_start date, p_cycle_end date, p_as_of date,
  p_cap numeric, p_weights jsonb
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

      select coalesce(sum(amount), 0) into v_spent
        from expenses
       where user_id = p_user
         and spent_on >= greatest(v_week_mon, p_cycle_start)
         and spent_on <= v_end_of_week;

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

grant execute on function public._spend_cycle_carry(uuid, date, date, date, numeric, jsonb) to authenticated;
