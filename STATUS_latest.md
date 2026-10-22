# Afterburner — Project Status & Handover

Last updated: 23 October 2026 — end of the `spend-sprint` branch, PR open to
main, not yet merged or run. Migration `0016_spend_sprint.sql` has NOT been
run in Supabase yet — do that by hand before merging, then redeploy.

Live at `afterburner-two.vercel.app` · repo `Grossundnett/afterburner` (private)
Supabase project ref `ijnemkslclmpjhewydkk`, region Mumbai (ap-south-1)
Vercel function region `bom1` — halved load time; never change it.
My Supabase user id: `bff03fd3-1687-487a-b9ce-ef26ba1c553c`
(Second test account: `d88c6d72-ab28-4b61-a241-46173f772060`)

---

## 1. RIGHT NOW — balances grant shipped, not yet verified live

**Balances on `/spend/plan` never saved**, as of the last session. Comma
parsing, column names and casing were all ruled out by code/schema audit (see
git history on `spend-sprint` and `SPRINT_NOTES.md` item 1 for the full
trail) — the one remaining untested theory was a missing table-level `GRANT`
alongside an otherwise-correct RLS policy. `0016_spend_sprint.sql` adds
`grant select, insert, update, delete on spend_balances to authenticated`.

**This is not yet confirmed fixed** — the migration hasn't been run in
Supabase yet (see the banner at the top of this file). Once it's run: enter a
balance on `/spend/plan`, confirm it saves, and confirm `real_money_left` on
`/spend` stops reading ₹0. If it still fails after the grant, every write
already chains `.select()` and surfaces "no row returned" as its own error
(from a prior session's hardening), so whatever shows next time is new
information, not a repeat of a theory already ruled out.

---

## 2. Fitness side — done and in daily use

- Google login, row-level security proven across two accounts
- `/log` — wake/sleep (24h), weight, blocker code + note, notes; activities with
  distance, duration (mm:ss) and pace; user-extensible sports; naps (recorded,
  never charted); editable activities
- `/days` — last 30 days, gaps visible
- `/` (Panel) — contribution grid with four honest states (not logged / rest /
  blocked / trained), weight with moving average and goal projection,
  this-week-vs-last bullet charts, sleep floating range bars against 07:00,
  "what stops you" blocker frequency, running pace inverted (faster = up), half
  marathon goal bar anchored at the first recorded half (2:10)
- Persistent nav: left sidebar on desktop, bottom bar on mobile, amber
  "Log today" action

**Dropped deliberately:** gym templates (notes are faster than dropdowns), Strava
(API is subscriber-only), Health Connect / Google Fit / Zepp (on-device, no server
read; a native app would be a month of rebuilding to save ten seconds a day).

---

## 3. Spend side — rebuilt around SPEND_RESEARCH.md

**`SPEND_RESEARCH.md` is the source of truth for /spend.** Older spend specs were
deleted. It recommends a weighted weekly allowance with a real partition, one hero
number, targeted friction on the two leaks, and no charts above the fold.

### Decisions made

| Question | Decision | Why |
|---|---|---|
| Categories | Six only: Food, Transport, Fun, Subscriptions, Big Buy, Other | More categories = more decisions = abandonment |
| Mapping | Food←Food · Transport←Travel + late tax · Fun←Life & Ent + guilty pleasure · Subscriptions←Software apps games + dating · Big Buy←fitness, shopping, clothes · Other←health, child support, charity, energy, rest | |
| Late tax | ₹1,500/month, nested under Transport, not a 7th category | Keeps six on screen, still tracks the bike-taxi leak |
| Payday | Last calendar day of the month | Sept salary landed on the 30th = last day |
| Cycle | Payday to day before next payday | Spending bunches after payday |
| Week | ISO Mon–Sun | The Monday BOB→Apex transfer is the habit cue; cycle-relative weeks would move it to a different weekday each month |
| Weighting | Per DAY: days 1–14 at 0.8, day 15+ at 1.2 | Mom's rule; per-day works for any week start |
| Real money | Apex + BOB + Cash, BOB entered as spendable only | Spendable money currently sits in BOB. Switch to Apex-only once the Monday transfer habit holds |
| Hero | min(budget left this week, real money ÷ remaining weeks), labelled when cash binds | |
| Cover | Adjustment for the current cycle only; never edits the plan | Otherwise "copy last month" inherits cuts and budgets ratchet down |
| Move card | Food and Transport never donors; no Cover when overspend exceeds all eligible slack | It was suggesting skipping meals to cover dating subscriptions |

### What exists
- `get_dashboard(p_today date)` — one RPC, security invoker, carry-over
  recomputed live from history so it can't drift. As of `0016`, splits OLD
  rules (cycles before 31 Oct 2026 — hero funded by the flat cap, unchanged)
  from NEW rules (31 Oct 2026 on — hero funded by in-cap category budgets
  only; Big Buy becomes a sinking fund, excluded from spend totals)
- Home: hero → Monday transfer card (Mondays only, until ticked) → this
  week's move → six bars sorted by overspend (Big Buy renders as a fund,
  "available" not "over budget") → emotion footnote (after 4 weeks of any
  tagged Fun/Big Buy entries) → month strip → Sunday-only review link →
  quick add, with a pre-submit waitlist/night-mode interrupt on qualifying
  entries
- `/spend/plan` — salary, investments, savings, Big Buy accrual (renamed
  from "buffer"), weekly Food/Transport/late tax, monthly Fun/Subscriptions/
  Big Buy/Other, Unassigned line (new-rules cycles only), balance snapshots
- `/spend/waitlist` — 48-hour pause on Subscriptions (any amount) and
  Fun/Big Buy over ₹1,500; Buy/Drop enforced server-side on real elapsed
  time, not just hidden buttons; "saved by waiting" total
- `/spend/review` — Sunday weekly review: under/over, leak of the week
  (flat per-week share, not a second day-weighted calc — see
  `SPRINT_NOTES.md` item 8), a fixed challenge keyed by the leak bucket,
  streak of weeks under
- `/spend/quick-add` — installable PWA entry point (`manifest.ts` +
  network-only `sw.js`), numeric keypad, six chips ranked by hour-of-day
  usage, Apex fixed, same `addExpense` action as the full form
- `/spend/import` — Wallet CSV by upload or paste; dedupe on
  `(source_ts, account)`; ghost-row detection; ongoing reconciliation check
- Account picker on the log form; emotion picker on Fun/Big Buy entries

### Verified working (pre-sprint, OLD-rules numbers — still true, unchanged
by this sprint for any cycle before 31 Oct 2026)
- Cap reads ₹32,305 (₹1,00,505 − ₹55,000 − ₹10,000 − ₹3,200)
- Overflow renders past 100%
- Day-weighting correct (Food ₹1,954 = 1800 ÷ 7 × 7.6)
- `cycle_end` correct (2026-10-30)
- Late tax tracked and shown over

### Not yet run live / not yet verified
- **Migration `0016_spend_sprint.sql` hasn't been run in Supabase.** Nothing
  in this section is live until it is.
- Everything built this sprint (items 1–9, `SPRINT_NOTES.md` has the full
  list) is unverified against real data — typechecked, linted and built
  clean, but not exercised in the browser against a live database. First
  things to actually click through after running the migration: balances
  save (§1), the November-cycle hero once that plan exists, the Monday
  transfer card, and one real 48-hour waitlist round trip.
- No real app icon for the PWA manifest — placeholder `favicon.ico`
  reference, flagged in `SPRINT_NOTES.md` item 9.

### Phase 0 — outside the app (do once, highest value)
Require authentication for all Play/App Store purchases · remove saved cards from
Play and dating apps · lower the UPI per-transaction limit on Apex · move dating
apps off the home screen.

---

## 4. Migrations applied

0001 init · 0002 sports table · 0003 spend · 0004 fitness · 0005 naps ·
0006 spend v2 · 0007 category groups · 0008 Dating/Guilty into Software, Health
merged · 0009 Business trips → Life & Ent · 0010 six categories · 0011 balances ·
0012 get_dashboard · 0013 cycle total · 0014 dashboard fixes · 0015 remove debug
fields · **0016 spend sprint — NOT YET RUN** (balances grant, buffer →
big_buy_accrual rename, spend_transfers table, emotion column, get_dashboard
old/new-rules rewrite — run this one by hand before merging `spend-sprint`)

---

## 5. Financial position (pay cycle 30 Sept – 30 Oct — OLD rules, last one)

Snapshot from 13 October, not re-pulled this sprint (no live DB query access
in this session — see `SPRINT_NOTES.md` item 2 for what that limited):

- Salary ₹1,00,505 · investments ₹55,000 · savings ₹10,000 (separate account,
  untouched) · discretionary cap ₹32,305 (pre-sprint buffer figure — now
  called `big_buy_accrual`, same number)
- **Spent ₹29,558 in 14 days — on pace for ₹65,451, double the cap**
- **Subscriptions ₹13,295 against ₹1,000.** Most on payday night, 30 Sept:
  ₹5,758.98 noted "Yep that's pure", ₹1,999 Claude Pro, two Hinge charges
- Big Buy at limit: ₹6,000 trainer pack
- Late tax ₹1,660 against ₹1,500 — bike taxis, several noted "because I was late"
- Real money left roughly ₹7,200 → about ₹379/day, ₹2,650/week to payday

The two leaks the research targets are exactly these: late-night subscriptions,
and lateness costing money via bike taxis. Both trace back to the 07:00 wake
target the fitness side tracks.

**31 October 2026 is the first NEW-rules cycle** — the one where Big Buy
stops being a category budget and starts being a sinking fund, and the hero
switches to being funded by in-cap category budgets instead of the flat cap.
That plan row doesn't exist yet; create it on `/spend/plan` before the 31st
so the cycle has a budget from day one.

---

## 6. Working agreement

1. **Sketch before building** anything touching schema, auth or a new module.
   Skip for changes under ~20 lines.
2. **One concern per commit. Always push.** Vercel deploys from GitHub; an
   unpushed commit is invisible and has caused at least four false "it's broken"
   investigations. In AGENTS.md.
3. **Migrations are run by hand** in the Supabase SQL editor, then committed.
   Claude Code cannot run DDL.
4. **Never use `auth.uid()` in SQL meant for the SQL Editor.** No logged-in user
   there, so it silently returns nothing. Use the literal user id. To run
   `get_dashboard` as a user:
   ```sql
   begin;
   select set_config('request.jwt.claims',
     '{"sub":"bff03fd3-1687-487a-b9ce-ef26ba1c553c","role":"authenticated"}', true);
   select get_dashboard(current_date);
   rollback;
   ```
5. **The SQL Editor shows only the last statement's result.** One diagnostic
   query per tab.
6. **Acceptance numbers are computed independently** of the parser, or the check
   proves nothing.
7. **`/clear` between pieces of work.** Repo docs hold the context.
8. **Every save must surface errors.** Silent failures have cost the most time of
   any bug class here.

---

## 7. Recurring bug classes

- **A control the server render depends on must not live inside the form that
  submits it.** Caused data loss on `/log`. In AGENTS.md.
- **Dates:** `toISOString()` is UTC; IST entries between 00:00 and 05:30 land on
  the previous day. Build date strings from local parts.
- **Indian number formatting** (1,00,505) parses as NaN → 0 unless stripped.
- **A card with no data says so, never vanishes.**
- **Zero means null for measurements**, but `reps = 0` on a failed set is data.
- **Silent save failures** — see §1.

---

## 8. Training goals the app supports

168 cm, ~66 kg, recomposition. Six-month targets: waist −6–7 cm, weight 64–66 kg,
12 dips, 15 pull-ups, 5K sub-20. Half marathon 2:10 → sub-1:40 by Sept 2027.
**Wake target 07:00 — the keystone variable.** Late wake-ups cost training time
and, via bike taxis, money.

---

## Files in the repo root

`AGENTS.md` (rules for Claude Code) · `ARCHITECTURE.md` (fitness spec) ·
`RESEARCH.md` (dashboard design research) · `SPEND_RESEARCH.md` (spend source of
truth) · `PHASE2.md` (fitness backlog) · `STATUS_latest.md` (this file) ·
`SPRINT_NOTES.md` (decision log for the `spend-sprint` branch — every sketch,
hand calculation and simplification made while building items 1–9)
