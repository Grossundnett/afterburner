# Afterburner — Project Status & Handover

Last updated: 13 October 2026

Live at `afterburner-two.vercel.app` · repo `Grossundnett/afterburner` (private)
Supabase project ref `ijnemkslclmpjhewydkk`, region Mumbai (ap-south-1)
Vercel function region `bom1` — halved load time; never change it.
My Supabase user id: `bff03fd3-1687-487a-b9ce-ef26ba1c553c`
(Second test account: `d88c6d72-ab28-4b61-a241-46173f772060`)

---

## 1. RIGHT NOW — the open bug

**Balances on `/spend/plan` never save.** `spend_balances` has zero rows for
every user, even after re-entering post-fix. This is the one thing blocking the
spend page from showing true numbers — the hero reads ₹0 because
`real_money_left` is 0.

**Ruled out:**
- Comma parsing — fixed in `a00a861`; the plan's top fields now save correctly
- RLS — policy `own spend_balances` covers ALL with
  `with_check ((select auth.uid()) = user_id)`. Correct.
- Wrong account — table is empty for every user
- **Column-name mismatch** — ruled out. Live columns confirmed via
  `information_schema.columns`: `id, user_id, account, amount, snapshot_at,
  created_at`. No `updated_at` anywhere; `recordBalance`'s insert only ever
  writes `user_id, account, amount`, all three real. The "original spec said
  updated_at" note was wrong or described an earlier draft, not shipped code.
- **Casing mismatch** — ruled out by direct code audit (not by a screen
  result — none was captured). Searched every place an account string is
  produced: four independent `const ACCOUNTS = ["Apex", "BOB", "Cash"]`
  declarations (now consolidated into `src/lib/accounts.ts`), all
  byte-identical. The balance form is three fixed buttons rendered from that
  array — nothing free-types or lowercases the value before it reaches
  `recordBalance`. The live constraint (`account = ANY
  (ARRAY['Apex','BOB','Cash'])`) matches exactly.

**Hardened regardless of cause (`6a59de9`):** every write in
`spend/actions.ts` and `spend/plan/actions.ts` now chains `.select()` and
treats "no error, but no row" as a failure in its own right — a write that
reports success but persists nothing was previously invisible.

**Still unknown — no further static-analysis theory survives.** The two
most plausible code bugs are both ruled out. Next diagnostic needed, in
order of how much it would tell us:
1. **What literally appears on screen** after clicking Update on the latest
   deploy — "Saved", a specific error string, or neither. This was asked for
   once and not captured ("`<WHAT I SAW>`" was left blank in the last report).
2. **Confirm the live deployment is actually `6a59de9` or later** (Vercel
   dashboard → Deployments → check the commit SHA) — the balances bug may
   have been tested against a deploy that predates the comma-parsing fix.
3. If (1) shows a real error: paste the exact text, it'll point straight at
   the cause (permission denied → a missing `GRANT` on the table to the
   `authenticated` role, the one remaining untested theory; a Postgres
   constraint name → something not visible in the constraint list already
   checked).
4. If (1) shows "Saved" / no error at all even post-`6a59de9`: that's new
   information the hardening should have made impossible — report it as its
   own finding, not as confirmation balances are broken the same way.

**Then:** make `recordBalance`'s insert match the real columns, and make every
save action surface errors instead of swallowing them. Three rounds have been
lost to silent failures.

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
  recomputed live from history so it can't drift
- Home: hero → move card → six bars sorted by overspend (pace tick, amber ahead,
  red overflow past 100% with "+₹X over") → month strip → quick add
- `/spend/plan` — salary, investments, savings, buffer, weekly Food/Transport/late
  tax, monthly Fun/Subscriptions/Big Buy/Other, balance snapshots. All budgets
  in one place.
- `/spend/import` — Wallet CSV by upload or paste; dedupe on
  `(source_ts, account)`; ghost-row detection; ongoing reconciliation check
- Account picker on the log form

### Verified working
- Cap reads ₹32,305 (₹1,00,505 − ₹55,000 − ₹10,000 − ₹3,200)
- Overflow renders past 100%
- Day-weighting correct (Food ₹1,954 = 1800 ÷ 7 × 7.6)
- `cycle_end` correct (2026-10-30)
- Late tax tracked and shown over

### Still to build (from SPEND_RESEARCH.md)
- **Phase 2:** quick-add PWA — amount first, six chips by time of day, under 5 s
- **Phase 3:** 48-hour waitlist (>₹1,500 and every subscription), night mode
  22:00–06:00, emotion tags on Fun/Big Buy, late-tax counter with if-then plan
- **Phase 4:** Sunday 3-minute weekly review with a streak

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
fields

---

## 5. Financial position (pay cycle 30 Sept – 30 Oct)

- Salary ₹1,00,505 · investments ₹55,000 · savings ₹10,000 (separate account,
  untouched) · discretionary cap ₹32,305
- **Spent ₹29,558 in 14 days — on pace for ₹65,451, double the cap**
- **Subscriptions ₹13,295 against ₹1,000.** Most on payday night, 30 Sept:
  ₹5,758.98 noted "Yep that's pure", ₹1,999 Claude Pro, two Hinge charges
- Big Buy at limit: ₹6,000 trainer pack
- Late tax ₹1,660 against ₹1,500 — bike taxis, several noted "because I was late"
- Real money left roughly ₹7,200 → about ₹379/day, ₹2,650/week to payday

The two leaks the research targets are exactly these: late-night subscriptions,
and lateness costing money via bike taxis. Both trace back to the 07:00 wake
target the fitness side tracks.

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
truth) · `PHASE2.md` (fitness backlog) · `STATUS.md` (this file)
