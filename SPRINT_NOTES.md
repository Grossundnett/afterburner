# Spend Sprint — decisions and hand checks

Branch `spend-sprint`. One section per item, written as the work happened —
this is the record of what was decided and why, not a retrospective summary.

---

## Item 1 — balances grant

`grant select, insert, update, delete on spend_balances to authenticated` added
to 0016. Harmless if it already existed. Closes the one remaining untested
theory from STATUS.md §1 (RLS policy present and correct, column names and
casing both ruled out by code/schema audit — a missing table-level GRANT
alongside a correct RLS policy was the only thing left that could silently
swallow every insert).

---

## Item 2 — carry-over hand check

**I do not have live query access to the expenses table from this session** —
no DB tool is wired into this environment, only the Supabase SQL Editor you
run by hand. So this isn't a result, it's the worked method plus the exact
query to get the one missing input. Once you have that number, the rest is
arithmetic you can check with a calculator.

### The October cycle (OLD rules — unaffected by this sprint)

Cycle: **30 Sep 2026 → 30 Oct 2026** (`cycle_start = 2026-09-30`, before the
`2026-10-31` new-rules cutoff, so `v_hero_fund = v_cap`).

Inputs given directly (your message, "ITEM 3 PLAN VALUES"):
```
salary            = 100,505
investments       =  55,000
savings_target    =  10,000
big_buy_accrual   =   5,505   (renamed from "buffer" — same column, same number)
cap = 100505 - 55000 - 10000 - 5505 = 30,000
```
Weights: `{"first_two": 0.8, "rest": 1.2}` (the default, and yours per
`spend_month_plans.week_weights`).

ISO weeks inside the cycle (Mon–Sun, cycle running 30 Sep–30 Oct):
```
W1: Mon 28 Sep – Sun  4 Oct   (cycle days 1–4 count:  30 Sep–4 Oct = days 1-5 of cycle*)
W2: Mon  5 Oct – Sun 11 Oct   (cycle days 6–12)
W3: Mon 12 Oct – Sun 18 Oct   (cycle days 13–19)
W4: Mon 19 Oct – Sun 25 Oct   (cycle days 20–26)
W5: Mon 26 Oct – Sun  1 Nov   (cycle days 27–30, clipped to cycle_end = 30 Oct)
```
\* `_spend_week_allowance` clips to `[cycle_start, cycle_end]` before summing
daily weights, so W1's allowance only counts 30 Sep–4 Oct (5 days), not the
28th/29th (those belong to the September cycle, already closed out).

`_spend_week_allowance(week_mon, week_sun, cycle_start, cycle_end, cap, weights)`
sums, for each day actually inside both the week AND the cycle, `cap/7 × weight`
where weight is 0.8 for cycle-day 1–14, 1.2 for day 15+, then returns that sum.
Per-day rate = `30000/7 = 4285.71`.

```
W1 (5 days, all weight 0.8):      5 × 4285.71 × 0.8  =  17,142.86
W2 (7 days, all weight 0.8):      7 × 4285.71 × 0.8  =  24,000.00
W3 (7 days — day 13,14 @0.8, day 15-19 @1.2):
     2 × 4285.71×0.8 + 5 × 4285.71×1.2 = 6,857.14 + 25,714.29 = 32,571.43
W4 (7 days, all weight 1.2):      7 × 4285.71 × 1.2 =  36,000.00
W5 (5 days to cycle_end, weight 1.2): 5 × 4285.71×1.2 = 25,714.29
```

The carry rule (`_spend_cycle_carry`, unchanged by this sprint for OLD-rules
cycles): each week, if the running carry is negative, only 30% of that week's
raw allowance can be eaten by catching up (`effective_in = max(carry, -0.3 *
raw)`); the rest of a deep deficit rolls forward instead of being forced in
one week. If carry is positive it rolls in fully (surplus isn't capped).

**The one number I can't hand-produce:** actual spend per week. Run this in
the SQL Editor (literal user id, not `auth.uid()` — no session there):

```sql
select
  date_trunc('week', e.spent_on)::date as week_mon,
  sum(e.amount) as spent
from expenses e
where e.user_id = 'bff03fd3-1687-487a-b9ce-ef26ba1c553c'
  and e.spent_on >= '2026-09-30' and e.spent_on <= '2026-10-30'
group by 1
order by 1;
```

Plug each week's `spent` into the loop above in order (W1 first): starting
`carry = 0`, for each week compute `effective_in` from the current carry,
`leftover = carry - effective_in`, then `carry := (raw + effective_in - spent)
+ leftover`. Whatever `carry` is after the last fully-elapsed week (or
to-date for the current week) — if negative, that's `month_debt =
-carry`. STATUS.md's last snapshot (13 Oct, 14 days in) had ₹29,558 spent
against a cap built for ₹32,305 under the old buffer number — that snapshot
predates this sprint's renamed column and isn't reusable as an input here,
only as a sanity check that the shape of the arithmetic (spend running close
to double the flat-cap pace) matches what's in `get_dashboard`'s
`month_debt` once you run it.

**This sprint does not change the October cycle's carry arithmetic at all** —
`v_new_rules := v_cycle_start >= '2026-10-31'` is false for 30 Sep, so
`v_hero_fund = v_cap` exactly as before the rename. The only thing that moved
is the column name feeding `v_cap`, not the number.

### The November cycle (NEW rules — first cycle this sprint affects)

Cycle: **31 Oct 2026 → 29 Nov 2026** (`cycle_start = 2026-10-31`, which is
`>= 2026-10-31`, so `v_new_rules = true` and `v_hero_fund = v_incap_total`,
NOT the flat cap).

```
v_incap_total = (Food + Transport) × weeks_in_cycle + Fun + Subscriptions + Other + late_tax
```

You haven't created the November plan row yet (it's a future month — `/spend/plan`
only lets you edit the cycle that's live or ahead of it once it exists), so I
can't read its category_budgets. What I do have: STATUS.md confirms **Food's
weekly budget is ₹1,800** (verified working: "Food ₹1,954 = 1800 ÷ 7 × 7.6").
Everything else below is shown symbolically — plug your real November numbers
in once you've saved that plan, the arithmetic doesn't change shape.

```
weeks_in_cycle = (29 Nov - 31 Oct + 1) / 7 = 30/7 = 4.2857

v_incap_total = (1800 + Transport) × 4.2857 + Fun + Subscriptions + Other + late_tax
```

First week of November (`W1: Mon 26 Oct – Sun 1 Nov`, clipped to
`cycle_start = 31 Oct`, so only **Sat 31 Oct + Sun 1 Nov = 2 days**, both at
weight 0.8 since cycle-day 1-2 < 15):

```
v_raw(W1) = _spend_week_allowance(...) = 2 days × (v_incap_total / 7) × 0.8
          = v_incap_total × 0.2286
```

With Food alone known (1800/week contributing 1800×4.2857 = 7,714.29 to
`v_incap_total` before the other four terms), the first week's Food-only
share of that allowance is `7714.29 × 0.2286 = 1,763.56` — i.e. just under
two days of Food's own weekly rate, which is the sanity check: for a
2-day week at the discount weight, you'd expect roughly `2/7 × 0.8 ≈ 0.229`
of a full week's rate, and `0.229 × 1800 = 411.4/day-equivalent... × 4.2857
weeks` — the arithmetic reduces to the same `0.2286` fraction applied to
whatever the full in-cap total turns out to be once Transport/Fun/
Subscriptions/Other/late_tax are in the November plan.

**Unassigned**, shown on `/spend/plan` (item 3 UI below) = `cap − incap_total`
— money allocated to the flat formula (salary − investments − savings −
big_buy_accrual) but not claimed by any category budget. It is explicitly
*not* spendable via the hero under new rules; it's a decision to go update
your category budgets, make a deliberate Big Buy accrual bump, or leave it
idle as an under-the-radar reserve. The dashboard returns it so it's visible,
not so it's silently folded back into real money left.

---

## Item 3 — Big Buy sinking fund

- `buffer` → `big_buy_accrual` renamed everywhere (migration, actions,
  PlanClient, this doc). Same slot in the cap formula.
- OLD rules (cycles before 31 Oct 2026): completely unchanged — hero funded
  by the flat cap, Big Buy counted in `v_spent` / `cycle_spent_total` like
  every other bucket. October's numbers don't move.
- NEW rules (31 Oct 2026 cycle onward): hero funded by `v_incap_total` (sum
  of in-cap category budgets only — Food/Transport's weekly rate scaled
  linearly by weeks-in-cycle, Fun/Subscriptions/Other/late_tax flat). Big Buy
  has no in-cap budget, is excluded from `v_spent` and `cycle_spent_total`,
  and its own bar shows the **fund** (`kind: 'fund'`) instead of a budget:
  `fund = sum(big_buy_accrual for every plan row whose cycle has started,
  from Nov 2026 on) − sum(Big Buy spend since 31 Oct 2026)`.
- `real_money_left` subtracts `greatest(fund, 0)` — the fund sits physically
  in BOB/Apex but isn't spendable money; a fund that's gone negative (spent
  ahead of accrual) must not hand money back, hence the floor at 0.
- PlanClient: "Buffer" field relabelled "Big Buy accrual/month"; summary adds
  an "Unassigned" line (`cap − incap_total`, only shown when a plan has any
  category budgets at all, since a from-scratch plan would otherwise show a
  confusing full-cap "unassigned").
- SpendClient: `Dashboard` type gains `new_rules`, `incap_total`,
  `unassigned`, `big_buy_fund`; `BudgetBar` renders a `kind: 'fund'` bar
  without a "% of budget" framing (a fund isn't a budget you can go over in
  the same sense — framed as "available" instead).

---

## Item 4 — Monday transfer card

- New table `spend_transfers(user_id, week_mon, ticked_at)`, PK
  `(user_id, week_mon)`. A row's existence means "ticked for that week" —
  no separate boolean column, no row means not yet ticked.
- Card shows only on Monday (`extract(isodow from today) = 1`) through the
  rest of that week until ticked, title "Transfer ₹X to Apex" where X is the
  current `cash_left_this_week` figure already in the dashboard payload when
  `binding = 'cash'` — when `binding = 'budget'` instead, the figure shown is
  `budget_left_this_week`, because that's the number actually governing this
  week regardless of which one binds. ("Binding hero number" = whichever of
  the two the dashboard already decided governs; the card just borrows it
  rather than recomputing anything.)
- Tick action: `tickTransfer()` upserts `(user_id, this_monday)` into
  `spend_transfers`. Idempotent — ticking twice is a no-op, not an error.
- The card disappears Tuesday regardless of tick state if the week's row is
  missing — not nagging past Monday was an explicit choice (SPEND_RESEARCH.md:
  targeted friction on the two leaks, not blanket nagging). Only Monday
  itself re-shows it if still unticked when the page reloads that same day.

---

## Item 5 — 48-hour waitlist

- Reuses the existing `wait_list` table from migration 0006 (`id, user_id,
  item, category, price, added_at, decision, decided_at`) — no new table
  needed, this item is wiring, not schema.
- Gate: any Fun/Subscriptions/Big Buy entry over ₹1,500, or ANY Subscriptions
  entry regardless of amount, routes to "Add to waitlist" instead of "Save"
  on the log form (both buttons shown; waitlisting is offered, not forced,
  since forcing it server-side on `addExpense` would also block legitimate
  corrections/backfills of a past spend already waited out elsewhere).
- `/spend/waitlist` page: three lists —
  - **Waiting** (`now() − added_at < 48h`): item, price, countdown
  - **Ready to decide** (`>= 48h`, `decision` still `'pending'`): Buy / Drop
    buttons. Buy inserts into `expenses` (spent_on = today, account = Apex)
    and sets `decision = 'bought'`. Drop just sets `decision = 'dropped'`.
  - **Saved by waiting**: sum of `price` where `decision = 'dropped'`, all
    time — the one number that makes waiting feel like it did something.
- `decision`'s real check constraint (confirmed from 0006, not from my own
  memory of the spec) is `pending|bought|dropped` — **not** `skipped`. Code
  below uses `dropped`.
- No GRANT needed on `wait_list` — unlike `spend_balances`, every other
  spend table (`expenses`, `spend_month_plans`) already works today without
  an explicit grant in its migration, which only makes sense if Supabase's
  default privileges already cover new `public` tables. `wait_list` was
  created the same way, so it's already covered; added nothing to 0016 for
  this.

---

## Item 6 — night mode

- 22:00–06:00 IST, computed from local wall-clock time parts (never
  `toISOString()` — the existing `dates.ts` has a same-class fix already
  noted in STATUS §7: UTC entries between 00:00–05:30 IST land on the wrong
  day). Checked client-side at the moment of typing a Fun or Subscriptions
  entry, not server-side — this is a prompt, not a gate, so there's no
  security reason to also enforce it in the Server Action.
- Prompt: "It's late. Is this the 'punish myself' kind? Waitlist it?" with
  two buttons — Waitlist it (routes to the same waitlist insert as item 5)
  or Log it anyway (falls through to the normal save).

---

## Item 7 — emotion tags

- `emotion` column on `expenses`, nullable, checked against
  `bored|lonely|celebrating|punishing`. Only shown on the log form when
  category group is Fun or Big Buy — the four other buckets never show it,
  consistent with "six categories max, no extra decisions on every entry."
- After 4 calendar weeks of any tagged entries, SpendClient shows one line:
  "X% of Fun/Big Buy spend this run was tagged <most frequent tag>" — a
  single percentage, not a breakdown chart (no charts above the fold, and
  this isn't above the fold either way — it's a footnote under the six bars).

---

## Item 8 — Sunday weekly review

- `/spend/review`, surfaced as a banner link on `/spend` only on Sundays.
- Reuses `get_dashboard`'s own `budget_left_this_week` / `spent_this_week` —
  no new per-week recomputation of the hero logic, since those two numbers
  are already exactly "this week, under or over, by how much."
- **Leak of the week**: a new SQL function `get_weekly_leak(p_today date)`
  (appended to 0016) sums this week's spend per bucket and compares it to a
  flat per-week share of that bucket's monthly budget (`budget / weeks_in_
  cycle` for monthly-kind buckets, the bucket's own weekly rate for weekly-
  kind buckets) — an approximation, not the full day-weighted truth, because
  "which single bucket hurt most this week" doesn't need day-weighting
  precision to be useful, and building a second exact replica of
  `_spend_week_allowance` per-bucket would double the surface area for the
  exact kind of silent-drift bug this sprint is closing elsewhere.
- **Streak**: consecutive past completed ISO weeks (most recent first, not
  counting the current in-progress week) where total non-Big-Buy spend did
  not exceed that same flat per-week share, stopping at the first losing
  week or at 12 weeks back, whichever comes first. Also computed in
  `get_weekly_leak` to avoid a second round trip.
- **One numbered challenge**: a static, deterministic pick keyed off which
  bucket leaked — not generated text, a fixed short list per bucket (e.g.
  Transport leak → "Challenge: wake by 07:00 three days this week — that's
  the bike-taxi trigger"), since SPEND_RESEARCH.md ties the whole discipline
  layer to the 07:00 wake target already tracked elsewhere in the app.

---

## Item 9 — PWA quick-add

- `manifest.json` + a network-only service worker (`sw.js`, no caching) —
  the stated minimum to pass Chrome's installability check. No offline
  support, no cache-first anything; caching an app whose entire value is
  live numbers would show stale budgets, which is worse than no PWA at all.
- `/spend/quick-add`: numeric keypad input (not a bare `<input type=number>`
  — IME/locale quirks on some Android keyboards), six category chips ordered
  by how often that category was used at this hour-of-day historically (a
  single `group by category, extract(hour from created_at)` query, ties
  broken by overall frequency), Apex preselected as account. Submits through
  the exact same `addExpense` Server Action as the full form — no second
  write path to keep in sync.
