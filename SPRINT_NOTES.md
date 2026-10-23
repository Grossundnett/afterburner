# Spend Sprint — decisions and hand checks

Branch `spend-sprint`. One section per item, written as the work happened —
this is the record of what was decided and why, not a retrospective summary.

## Checklist

- [x] 1. Balances grant (`spend_balances` GRANT in 0016)
- [x] 2. Carry-over hand check (October worked method; one input needs a
      live query — see the section below)
- [x] 3. Big Buy sinking fund (`big_buy_accrual` rename, new/old rules split,
      Unassigned line, fund-kind bar)
- [x] 4. Monday transfer card (`spend_transfers` table, tick action)
- [x] 5. 48-hour waitlist (`/spend/waitlist`, server-enforced 48h)
- [x] 6. Night mode (22:00–06:00 IST prompt, shares UI with item 5)
- [x] 7. Emotion tags (picker + 4-week percentage footnote)
- [x] 8. Sunday weekly review (`/spend/review`)
- [x] 9. PWA quick-add (manifest, service worker, `/spend/quick-add`)

Every item above is committed and pushed to `spend-sprint`. **None of it has
been run against a live database or clicked through in a browser** — this
session had no DB query access and no way to launch the dev server against
real Supabase data. Migration `0016_spend_sprint.sql` must be run by hand
before any of this goes live. Typecheck, lint and `next build` all pass
clean as of the last commit on this branch.

**Three real mistakes were found and fixed on a second pass against your
literal brief** — item 2's hand-calc used the wrong formula, item 5 built
the wrong decision model, item 8's write-up described a SQL function that
was never built. See "Corrections made after the first pass" near the end
of this file for what was wrong and what changed. Nothing else was found
wrong, but only what the re-read directly called into question was
re-checked — treat this as "re-audited where flagged," not "every line
re-verified."

---

## Item 1 — balances grant

`grant select, insert, update, delete on spend_balances to authenticated` added
to 0016. Harmless if it already existed. Closes the one remaining untested
theory from STATUS.md §1 (RLS policy present and correct, column names and
casing both ruled out by code/schema audit — a missing table-level GRANT
alongside a correct RLS policy was the only thing left that could silently
swallow every insert).

**Checks to run after applying 0016** (literal user id, not `auth.uid()`):

1. Confirm the grant landed:
   ```sql
   select grantee, privilege_type
   from information_schema.role_table_grants
   where table_name = 'spend_balances' and grantee = 'authenticated';
   ```
   Expect 4 rows: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
2. On `/spend/plan`, enter a balance for any account and click Update. Expect
   "Saved" to appear (not an error) and the "last recorded" line under that
   account to update to the new figure.
3. Confirm the row actually exists:
   ```sql
   select account, amount, snapshot_at
   from spend_balances
   where user_id = 'bff03fd3-1687-487a-b9ce-ef26ba1c553c'
   order by snapshot_at desc
   limit 5;
   ```
   Expect the row just entered, timestamped within the last minute.
4. Reload `/spend` and confirm `real_money_left` is no longer ₹0 (it may
   still read low or negative depending on real balances — the test is that
   it moved off the hardcoded-looking zero, not a specific number).

If step 2 or 3 fails with an actual error message, that message is new
information — the grant was the only remaining untested theory, so a
failure here means a fourth cause exists that wasn't visible from code/schema
inspection alone, and is worth reporting back rather than re-trying the same
fix.

---

## Item 2 — carry-over hand check

**CORRECTION, written after the first version of this section shipped:** my
first pass hand-computed `_spend_week_allowance` as `cap/7 × weight` per day,
summed over the days in each week. That is **not** what the function does —
I wrote that from memory instead of reading the actual SQL first, and it's
wrong. The real function (migration 0012, unchanged since) is a **normalised
share**:

```sql
-- public._spend_week_allowance(week_mon, week_sun, cycle_start, cycle_end, cap, weights)
v_total := sum of weight(day) for EVERY day in [cycle_start, cycle_end]
v_raw   := sum of weight(day) for days in [week_mon, week_sun] ∩ [cycle_start, cycle_end]
return cap * v_raw / v_total
```

So every week's allowance is `cap` scaled by that week's share of the whole
cycle's weight-mass — the weekly allowances for a full cycle always sum to
*exactly* `cap`, by construction (the fractions sum to 1). My first draft had
them summing to ~4.3× the cap, which was visibly wrong and should have been
caught before it shipped. Corrected below; this also directly answers the
brief's acceptance check (a) for item 3.

### The October cycle (OLD rules — unaffected by this sprint)

Cycle: **30 Sep 2026 → 30 Oct 2026** (`cycle_start = 2026-09-30`, before the
`2026-10-31` new-rules cutoff, so `v_hero_fund = v_cap = 30,000`, same as
before the rename).

`v_len = 31` days (Sep 30 – Oct 30 inclusive). Weight is 0.8 for cycle-day
1–14, 1.2 for day 15+:

```
v_total = 14×0.8 + 17×1.2 = 11.2 + 20.4 = 31.6
```

ISO weeks overlapping the cycle, mapped to cycle-day numbers and clipped to
`[cycle_start, cycle_end]`:

```
W1: Mon 28 Sep–Sun 4 Oct  → cycle days 1–5  (Sep28/29 excluded, prior cycle)  weight-sum = 5×0.8 = 4.0
W2: Mon 5 Oct–Sun 11 Oct  → cycle days 6–12                                   weight-sum = 7×0.8 = 5.6
W3: Mon 12 Oct–Sun 18 Oct → cycle days 13–19 (13,14 @0.8; 15–19 @1.2)        weight-sum = 2×0.8+5×1.2 = 7.6
W4: Mon 19 Oct–Sun 25 Oct → cycle days 20–26                                  weight-sum = 7×1.2 = 8.4
W5: Mon 26 Oct–Sun 1 Nov  → cycle days 27–31, clipped to Oct 30 (5 days)     weight-sum = 5×1.2 = 6.0
                                                                sum check: 4.0+5.6+7.6+8.4+6.0 = 31.6 ✓
```

```
v_raw(week) = cap × weight-sum(week) / v_total,  cap = 30,000

W1 = 30000 × 4.0/31.6 =  3,797.47
W2 = 30000 × 5.6/31.6 =  5,316.46
W3 = 30000 × 7.6/31.6 =  7,215.19
W4 = 30000 × 8.4/31.6 =  7,974.68
W5 = 30000 × 6.0/31.6 =  5,696.20
                                sum check: 30,000.00 ✓ exactly the cap, as it must
```

These are the real weekly allowances — a believable ₹3.8k–8k/week against a
₹30k monthly cap, not the ~₹25k–36k/week my first draft produced.

The carry rule (`_spend_cycle_carry`, unchanged by this sprint for OLD-rules
cycles): each week, if the running carry is negative, only 30% of that
week's `v_raw` can be eaten by catching up (`effective_in = max(carry, -0.3 ×
raw)`); the rest of a deep deficit rolls forward instead of being forced in
one week. If carry is positive it rolls in fully (surplus isn't capped).

**The one number I still can't hand-produce:** actual spend per week — no DB
query tool is wired into this session, only the Supabase SQL Editor you run
by hand. Run this (literal user id, never `auth.uid()` — no session in the
Editor):

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
`carry = 0`, for each week compute `effective_in = max(carry, -0.3 × v_raw)`
if `carry < 0` else `carry`, `leftover = carry - effective_in`, then
`carry := (v_raw + effective_in - spent) + leftover`. Whatever `carry` is
after the last fully-elapsed week (or to-date for the current week) — if
negative, `month_debt = -carry`. **"Assuming zero further spend" for the
rest of the cycle just means: for every week after today's, use `spent = 0`
and keep running the same loop through W5** — the 30%-catchup rule still
applies to those remaining weeks, so a deep enough deficit can still show
residual debt at cycle-end even with no more spending, if the remaining
weeks' allowance isn't enough to absorb it at the capped catch-up rate.

STATUS.md's last snapshot (13 Oct, day 14 of the cycle, partway through W3)
had ₹29,558 cumulative spend. That's a single cumulative total, not a
per-week breakdown, so it can't be dropped into the per-week loop above
without guessing how it splits across W1/W2/partial-W3 — I won't fabricate
that split. It's usable only as a rough sanity bound: W1+W2+partial-W3's
allowance-to-date is `3,797+5,316+ (partial W3, 2 of 7 days) ≈ 11,174`
against `29,558` spent — already deep in deficit by day 14, consistent with
STATUS's "on pace for double the cap," but not a substitute for the real
per-week query above.

**This sprint does not change the October cycle's carry arithmetic at all** —
`v_new_rules := v_cycle_start >= '2026-10-31'` is false for 30 Sep, so
`v_hero_fund = v_cap` exactly as before the rename. The only thing that moved
is the column name feeding `v_cap`, not the number.

### The November cycle (NEW rules — first cycle this sprint affects)

Cycle: **31 Oct 2026 → 29 Nov 2026** (`cycle_start = 2026-10-31`, which is
`>= 2026-10-31`, so `v_new_rules = true` and `v_hero_fund = v_incap_total`,
NOT the flat cap). Plan values from your message ("Plan values from the 31
Oct cycle"): Food 1,800/wk, Transport 800/wk, late tax 1,500/month, Fun
3,000, Subscriptions 1,000, Other 4,000, big_buy_accrual 5,505.

```
weeks_in_cycle = (29 Nov − 31 Oct + 1) / 7 = 30/7 = 4.285714

v_incap_total = (Food + Transport) × weeks_in_cycle + Fun + Subscriptions + Other + late_tax
              = (1800 + 800) × 4.285714 + 3000 + 1000 + 4000 + 1500
              = 2600 × 4.285714 + 9500
              = 11,142.86 + 9,500
              = 20,642.86
```

Matches your own estimate of "about 20,600" — good, the formula's right.

`v_len = 30` days (Oct 31 – Nov 29). Weight 0.8 for cycle-day 1–14 (Oct
31–Nov 13), 1.2 for day 15+ (Nov 14–29):
```
v_total = 14×0.8 + 16×1.2 = 11.2 + 19.2 = 30.4
```

First week (`W1: Mon 26 Oct–Sun 1 Nov`, clipped to `cycle_start = 31 Oct`, so
only **Sat 31 Oct (day 1) + Sun 1 Nov (day 2)** — both weight 0.8):
```
weight-sum(W1) = 2 × 0.8 = 1.6
v_raw(W1) = v_incap_total × 1.6/30.4 = 20,642.86 × 0.052632 = 1,086.46
```

**First week's hero allowance under the new rules: ₹1,086.46** — a real
number this time, not a symbolic placeholder.

### Item 3's four acceptance checks, from your brief

**(a) "weekly allowances across the 31 Oct–29 Nov cycle sum to the in-cap
budgets (about 20,600), not 30,000."** True by construction of the corrected
formula above — any `cap` value passed to `_spend_week_allowance` gets fully
distributed across the cycle's weeks (the fractions sum to 1), so passing
`v_incap_total = 20,642.86` as the hero's funding base means the weeks sum to
**20,642.86**, not 30,000. ✓

**(b) "this week's Food is still 1,954."** `_spend_weekly_rate_budget` (Food
and Transport's own per-category weekly budget display) is a *different*
function from `_spend_week_allowance` — I didn't touch it anywhere in 0016.
With Food = 1,800/wk and a week at weight-sum 7.6 (the day-13-to-19 week
from the October hand check above — "this week" when you wrote the brief):
`1800 ÷ 7 × 7.6 = 1,954.29`. Unchanged, because the code computing it is
unchanged. ✓

**(c) "the October month debt is the same before and after."** True by
construction — `v_new_rules` is false for `cycle_start = 2026-09-30`, so
`v_hero_fund := v_cap` exactly, and `v_cap`'s formula
(`salary − investments − savings_target − big_buy_accrual`) is arithmetically
identical to the old `salary − investments − savings_target − buffer`; only
the column name changed. Nothing about October's carry loop reads
`v_incap_total` at all. ✓

**(d) "Unassigned = 30,000 − (a)."**
```
Unassigned = cap − v_incap_total = 30,000 − 20,642.86 = 9,357.14
```
Shown on `/spend/plan` once the November plan row exists with these budgets.

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

**CORRECTION, written after the first version shipped:** my first pass built
a Buy/Drop model with a `'dropped'` decision and "saved by waiting" summing
drops. Re-reading the brief literally — "An item expires unbought 7 days
after unlocking, **or** immediately on 'Don't want it'" — those are two ways
to reach the **same** terminal state (expired-unbought), not two different
decisions. There is no separate "dropped" concept in the actual spec. Fixed:

- `wait_list.decision` check constraint widened (0016) to add `'expired'`
  alongside 0006's original `pending|bought|dropped` (kept `dropped` in the
  allowed set rather than renaming it away, since nothing live depends on
  this table yet and there's no reason to force a column-constraint rename
  beyond what's needed — but all new code writes `'expired'`, never
  `'dropped'`).
- Reuses the existing `wait_list` table from migration 0006 (`id, user_id,
  item, category, price, added_at, decision, decided_at`) — otherwise no new
  table needed, this item is wiring, not schema.
- Gate: any Fun/Subscriptions/Big Buy entry over ₹1,500, or ANY Subscriptions
  entry regardless of amount, routes to "Add to waitlist" instead of "Save"
  on the log form (both buttons shown; waitlisting is offered, not forced,
  since forcing it server-side on `addExpense` would also block legitimate
  corrections/backfills of a past spend already waited out elsewhere).
- `/spend/waitlist` page: two lists —
  - **Waiting** (`now() − added_at < 48h`): item, price, hours until
    unlocked, a "Don't want it" button (works immediately — no reason to
    make someone wait 48h just to decide *against* something)
  - **Ready to decide** (`>= 48h`): "Don't want it" (→ `expired`) or Buy (→
    inserts into `expenses`, spent_on = today, account = Apex, then marks
    `bought`) — Buy alone is refused server-side if 48h genuinely haven't
    elapsed; "Don't want it" has no time check at either stage.
  - **Auto-expiry**: `sweepExpiredWaitlist()` runs at the top of the
    waitlist page's own server render (no cron infra here, so it's lazy —
    whoever next opens `/spend/waitlist` triggers the sweep, scoped to their
    own `user_id` only). Marks any still-`pending` row `expired` once
    `now() − added_at >= 9 days` (48h unlock + 7 days, per the brief).
  - **Saved by waiting**: sum of `price` where `decision = 'expired'`, all
    time, regardless of which of the two paths got it there.
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
- Reuses `get_dashboard`'s own `budget_left_this_week` for the under/over
  line — no new recomputation of the hero logic for that figure.
- **Leak of the week and streak are computed in `/spend/review/page.tsx`
  (TypeScript), not a new SQL function** — no schema change for this item at
  all, keeping the sprint's "all schema changes in one file" promise simpler
  than it would be with yet another `0016` function. It queries `expenses`
  grouped by category per week and compares against a flat per-week share
  of that bucket's budget (`budget / weeks_in_cycle` for monthly-kind
  buckets, the bucket's own weekly rate for weekly-kind buckets) — an
  approximation, not the full day-weighted truth, because "which single
  bucket hurt most this week" doesn't need day-weighting precision to be
  useful, and a second exact replica of `_spend_week_allowance` per-bucket
  would double the surface area for the exact kind of silent-drift bug this
  sprint is closing elsewhere (see item 2's correction above — that's
  exactly the mistake a second untested copy of this formula could repeat).
- **Streak**: consecutive past completed ISO weeks (most recent first, not
  counting the current in-progress week) where total non-Big-Buy spend did
  not exceed that same flat per-week share, stopping at the first losing
  week or at 12 weeks back, whichever comes first — computed with one
  `expenses` query per week looked back, using the CURRENT cycle's budgets
  even for a week that fell in an earlier cycle (a documented
  approximation, not a bug: a precise version would need each historical
  cycle's own plan row, which this doesn't fetch).
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
  by how often that category was used at this hour-of-day historically (from
  the last 500 spends, no new SQL — computed in `page.tsx`), Apex fixed, not
  a selector (speed over flexibility, matches "under 5s"). Submits through
  the exact same `addExpense` Server Action as the full form, so night mode,
  the waitlist gate and error surfacing all apply exactly as they do on the
  main form — one write path, not two.

---

## GitHub Action check

`gh workflow list` → **"Keep Supabase awake" — active — id 360162627.**
Checked once early in the sprint and again just now, re-verifying before
writing this up rather than trusting memory: same result both times.

---

## Corrections made after the first pass (read this if you're skimming)

Three real mistakes were caught by re-reading this file against your literal
brief and the actual SQL, rather than trusting my own first draft:

1. **Item 2's hand-calc used the wrong formula** for `_spend_week_allowance`
   — written from memory instead of from the actual function body. Fixed;
   see item 2 above for the corrected arithmetic and item 3's four
   acceptance checks, now with real numbers instead of symbolic
   placeholders.
2. **Item 5 built the wrong decision model** — a `Buy/Drop` pair instead of
   the brief's actual `Buy/expires-unbought` model, where "Don't want it" and
   the 7-day auto-expiry are two paths to the *same* outcome. Fixed: schema
   widened, code rewritten, UI relabelled.
3. **Item 8's write-up claimed a new SQL function that was never built** —
   the real implementation computes the leak/streak in TypeScript. Fixed to
   describe what's actually in the diff.

Nothing else in this file was found to be wrong on re-audit, but I only
re-checked what the re-read brief called into question directly — this
isn't a claim that everything else was re-verified line by line.

---

## FINAL ROUND — chunk A (blocking fixes)

### A1 — balances still not saving

Re-audited `recordBalance` (plan/actions.ts), the RLS policy (0011), and the
`PlanClient` wiring end to end. **The Update button was never inside a
`<form>` and was never nested in the plan-save form** — `BalancesCard` is a
sibling rendered after the plan `</form>` closes, and its button is
`type="button"` with a direct `onClick={() => save(account)}`. Nested forms,
a wrong action binding and a bad button type were all ruled out by reading
the actual JSX, not assumed.

The grant from 0016 is real and landed (idempotent, harmless either way),
but per item 5's own earlier note every other spend table already worked
without an explicit grant — Supabase's default privileges likely already
covered `spend_balances` too, so the grant may not have been the true fix,
consistent with your report that rows are still at zero after it ran.

**What changed this round, since a 4th cause can't be found by reading code
alone without DB access:**
- `recordBalance` now returns the saved row's `account`, `amount`,
  `snapshot_at` on success (previously returned nothing), and
  `console.error`s both failure modes (Postgres error, and "no error but no
  row") server-side so they show in Vercel's function logs.
- The Update button now shows **"Saved Apex ₹5,000 at 14:32"** (built from
  the row the database actually returned, not an optimistic guess) instead
  of a bare "Saved" label.

**3-step test:**
1. On `/spend/plan`, type an amount for Apex, click Update.
2. Expect either `Saved Apex ₹X at HH:MM` directly under the row, or the
   full error text in red. If this still shows nothing at all (button does
   nothing, no text changes), that's new information — the click isn't
   reaching `save()`, which nothing in this codebase explains; check the
   browser console for a JS error instead.
3. Confirm the row exists:
   ```sql
   select account, amount, snapshot_at
   from spend_balances
   where user_id = 'bff03fd3-1687-487a-b9ce-ef26ba1c553c'
   order by snapshot_at desc
   limit 5;
   ```
   If step 2 showed a confirmation but this query comes back empty, or
   shows an error message that isn't "RLS"/"grant"-shaped, paste it back —
   that's the real 4th cause this session couldn't reach without DB access.

### A2 — Unassigned, and the day-weighted formula correction

`/spend/plan` was showing "Allocated (weekly × 4 + monthly)" / "Room left to
allocate" always, and a separate "Unassigned" line only for new-rules
cycles (Nov 2026 on) — both removed, replaced by a single **Unassigned**
line shown for every cycle.

**A real formula bug, not just a missing feature:** both `get_dashboard`'s
SQL (0016) and `PlanClient`'s own live preview computed Food/Transport's
contribution to the cycle total as `weeklyRate × (cycle_len / 7)` — plain
calendar weeks. But every week's own Food/Transport budget bar
(`_spend_weekly_rate_budget`) scales that same weekly rate by **that week's
share of Mom's rule's day-weight mass** (0.8/day for cycle-day 1-14, 1.2/day
after) via `_spend_week_allowance`'s same v_total. Summed across a whole
cycle, the real weekly bars add up to `weeklyRate / 7 × weight_mass`, not
`weeklyRate × plain_weeks` — a different number whenever weight_mass ≠
plain_weeks × 7 (true for any cycle with a mix of 0.8 and 1.2 days, i.e.
every real cycle). Confirmed against your hand check:
- October (len 31, weight_mass = 14×0.8 + 17×1.2 = **31.6**): Food
  contribution = 1800/7 × 31.6 = **8,125.7 ≈ 8,126** ✓. Transport = 800/7 ×
  31.6 = **3,611.4 ≈ 3,611** ✓. (The old plain-weeks formula would have
  given 1800 × 31/7 = 7,971 and 800 × 31/7 = 3,543 — visibly different,
  confirming the old formula was wrong, not just differently rounded.)
- November (len 30, weight_mass = 14×0.8 + 16×1.2 = **30.4**): Food =
  1800/7 × 30.4 = **7,817.1 ≈ 7,817** ✓. Transport = 800/7 × 30.4 =
  **3,474.3 ≈ 3,474** ✓.

I could not independently verify the full Unassigned totals (6,568 /
10,709) against your real October/November `category_budgets` — this
session has no DB query access, so "flat 14,000" (Oct) / "flat 8,000" (Nov)
are taken on trust as whatever Fun+Subscriptions+Other+late-tax actually
sum to in your real plan rows, not re-derived here. The formula is what's
fixed; run `get_dashboard` after 0017 (checklist below) and compare.

**Late tax confirmed nested in Transport, not added on top, in the sense
that matters:** the six-bar UI (`SpendClient`'s `BudgetBar`) shows late tax
as a `sub` line *inside* Transport's own bar, never a 7th bar. For the
Unassigned/incap_total arithmetic, late tax is still its own additive term
(`+ v_late`), same as Fun/Subscriptions/Other — it is counted exactly once,
just like every other budget line; "nested" describes the display grouping,
not a different arithmetic treatment. Nothing changed here, confirmed by
reading `BudgetBar`'s `sub` prop and `get_dashboard`'s `v_late` term.

**Schema change — `supabase/migrations/0017_final.sql` — not yet run.**
Rewrites `get_dashboard` (`CREATE OR REPLACE`, same signature, idempotent)
to use the corrected weight-mass formula for `incap_total`/`unassigned`,
computed for every cycle now (old rules previously left `incap_total` at 0,
so `unassigned` silently read as the full cap — also fixed). **Old-rules
hero funding is unchanged** — `v_hero_fund` still reads the flat cap for
cycles before 31 Oct 2026; only new-rules cycles (Nov 2026 on) fund the hero
from the now-corrected `incap_total`, which changes the November hero
number slightly from the placeholder calc two sessions ago (that number was
never live — no plan row existed yet).

**Run this, then verify:**
```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"bff03fd3-1687-487a-b9ce-ef26ba1c553c","role":"authenticated"}', true);
select get_dashboard('2026-10-23');  -- October, OLD rules
rollback;
```
Expect `"new_rules": false` and `"unassigned"` now a real number (not equal
to the full `discretionary_cap`, unless your October plan genuinely has no
category budgets at all).
```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"bff03fd3-1687-487a-b9ce-ef26ba1c553c","role":"authenticated"}', true);
select get_dashboard('2026-10-31');  -- November, NEW rules, once that plan row exists
rollback;
```
Expect `"new_rules": true` and `"incap_total"` to match the weighted hand
check above for whatever your real Food/Transport/Fun/Subscriptions/Other/
late-tax numbers are.

### A3 — Big Buy fund ignores pre-cycles, confirmed

Already correct, no code change. The accrual loop in `get_dashboard`
(0016, unchanged by 0017) is:
```sql
for v_row in
  select month, big_buy_accrual from spend_month_plans
   where user_id = v_user and month >= '2026-11'
loop
```
The `month >= '2026-11'` filter means October's plan row (`month = '2026-10'`,
holding the old ₹3,200 buffer figure) is never selected into this loop at
all — it can't contribute to `v_accrued` regardless of `p_today`. The fund
only ever sums `big_buy_accrual` from November 2026 plan rows onward, and
only once each one's own cycle has started (`v_row_cycle_start <= p_today`).
October's old buffer number is structurally unreachable here, not just
zero by coincidence.

---

## FINAL CHECKLIST — do these in order

1. **Run `supabase/migrations/0016_spend_sprint.sql` once, in full, in the
   Supabase SQL Editor.** It's wrapped in `begin/commit` and idempotent —
   safe to run even if some part of it partially landed before.

2. **Verify the balances grant** (item 1's checks above, repeated here for
   the order you asked for):
   ```sql
   select grantee, privilege_type
   from information_schema.role_table_grants
   where table_name = 'spend_balances' and grantee = 'authenticated';
   ```
   Expect 4 rows: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.

3. **Verify the rename landed and the function signatures are singular**
   (confirms `big_buy_accrual` exists, `buffer` is gone, and the old 6-arg
   `_spend_cycle_carry` overload didn't survive the `drop function` in 0016):
   ```sql
   select column_name from information_schema.columns
   where table_name = 'spend_month_plans' and column_name in ('buffer', 'big_buy_accrual');
   -- expect exactly one row: big_buy_accrual

   select pg_get_function_identity_arguments(oid) from pg_proc
   where proname = '_spend_cycle_carry';
   -- expect exactly one row, ending in "boolean"
   ```

4. **Verify `get_dashboard` runs for the October cycle without error** (as
   the literal user, via the JWT claims trick — no session in the Editor):
   ```sql
   begin;
   select set_config('request.jwt.claims',
     '{"sub":"bff03fd3-1687-487a-b9ce-ef26ba1c553c","role":"authenticated"}', true);
   select get_dashboard('2026-10-23');
   rollback;
   ```
   Expect a JSON object with `"new_rules": false` (October is still OLD
   rules), `"discretionary_cap": 30000` (or whatever your real salary/
   investments/savings/big_buy_accrual currently are), and no SQL error.

5. **Enter a real balance on `/spend/plan`** and confirm it saves (item 1,
   check 2 above) and `real_money_left` on `/spend` moves off ₹0.

6. **Create the November plan row** on `/spend/plan` before the 31st, using
   the budgets from item 2/3's hand check if they're still accurate (Food
   1800/wk, Transport 800/wk, late tax 1500, Fun 3000, Subscriptions 1000,
   Other 4000, big_buy_accrual 5505) or your real updated numbers. Once
   saved, confirm `get_dashboard('2026-10-31')` returns `"new_rules": true`,
   `"incap_total"` close to **20,642.86**, and `"unassigned"` close to
   **9,357.14** (exact figures depend on whatever you actually enter).

7. **Click through the rest of item 9's test plan** already in the PR
   description (Monday transfer card, a real 48-hour waitlist round trip,
   installing `/spend/quick-add`).

8. **Merge the PR** (`spend-sprint` → `main`) once 1–7 look right. It's
   already open, not yet merged: https://github.com/Grossundnett/afterburner/pull/1
