# Afterburner — Project Status & Handover

**Build phase complete.** 0017 and 0018 have both run; every item from the
final build round (1 through 9) has shipped. Nothing left to build — click
through the hand-check list in §6, then it's a month of real use before
planning a native app.

Live at `afterburner-two.vercel.app` · repo `Grossundnett/afterburner` (private)
Supabase project ref `ijnemkslclmpjhewydkk`, region Mumbai (ap-south-1)
Vercel function region `bom1` — halved load time; never change it.
My Supabase user id: `bff03fd3-1687-487a-b9ce-ef26ba1c553c`
(Second test account: `d88c6d72-ab28-4b61-a241-46173f772060`)

---

## 1. Migrations — all run, all live

| Migration | What it does | Status |
|---|---|---|
| 0001–0015 | Fitness schema, early spend schema | Run, live |
| 0016 `spend_sprint` | Balances grant, buffer→big_buy_accrual, transfers, emotion, waitlist, old/new-rules split | Run, live |
| 0017 `final` | Fixes incap_total/Unassigned to use Mom's-rule day-weight mass instead of plain weeks | **Run, live** |
| 0018 `categories` | Six-category model, Shopping sub-budgets, deletes late tax | **Run, live** |

Spot-check any time:
```sql
select key, "group" from spend_categories
where user_id = 'bff03fd3-1687-487a-b9ce-ef26ba1c553c' order by sort;
-- expect exactly 6 rows: Food, Transport, Fun, Subscriptions, Shopping, Other
```

---

## 2. Final build round — every item shipped

The "final build round" brief's items 1–9 are all done:

1. Balance-save timestamp fixed (`12:15 pm`, not `0:15pm`).
2. Audited every picker app-wide for network-per-tap — found none, but your
   phone testing caught two real bugs anyway (silent digit-cap drop, taps
   before hydration): both fixed. See §9.
3. Migration 0018 — six-category model, Shopping sub-budgets. Run.
4. UI for the category model: quick-add's six chips with sub-label reveal
   and the restored "Apex · Today" account/date chip; `/spend`'s six bars
   with Shopping's four sub-budgets as real indented bars and a Food/
   Transport sub-label line; `/spend/plan`'s Shopping sub-budget inputs
   with a live sum-vs-accrual check; the Wallet CSV import's category
   mapping updated to match (it would have silently mismatched everything
   post-0018 otherwise — caught and fixed in the same turn).
5. The 31 Oct plan values — SQL upsert and the exact `/spend/plan`
   click-through order are both in `SPRINT_NOTES.md`; enter them (or run
   the SQL) once this cycle governs "today."
6. October/November Unassigned figures confirmed exactly by hand.
7. Theme rolled out (ember orange replaces amber), design-guidelines fixes
   applied, `/theme-preview` deleted.
8. `web-design-guidelines` skill committed.
9. This file.

## 3. Decisions changed this round (read this against SPEND_RESEARCH.md)

SPEND_RESEARCH.md's original six categories were Food, Transport, Fun,
Subscriptions, **Big Buy**, Other, with a separate ₹1,500/month late-tax
envelope nested under Transport. This round's brief changed both, and
**this prompt wins where it conflicts with the research brief** — record
kept here per that round's own instruction:

- **Big Buy → Shopping.** Same slot in the cap formula, same sinking-fund
  mechanism from 31 Oct 2026 on. Gains four sub-labels, each with its own
  monthly sub-budget that must sum to `shopping_accrual`: Fitness gear,
  Football, Clothes & shoes, Electronics.
- **Late tax is gone as a concept.** Transport is one flat weekly budget
  (₹800/week total under the November plan), no separate envelope. Its
  replacement is "Paid rides" — a computed count + total of Auto + Bike
  taxi spend this week, informational only, no budget of its own.
- **Sub-labels, app-wide.** Food gets Groceries/Eating out/Snacks & drinks
  (no sub-budgets); Transport gets Public transport/Auto/Bike taxi (no
  sub-budgets); Shopping's four sub-labels carry the only sub-*budgets*.
  Fun, Subscriptions, Other have none.
- **October keeps its old mechanics, just renamed.** The cap formula, the
  hero funding (flat cap), and Shopping/Big Buy's status as a normal
  in-cap category for that one cycle are all unchanged — only the label
  moved. `incap_total`/Unassigned now *includes* Shopping's flat budget
  for cycles before 31 Oct 2026 specifically (new rules keep excluding it)
  — this is a real formula change from 0017, required by this round's own
  October hand-check (see `SPRINT_NOTES.md` item 6).

---

## 4. Fitness side — done and in daily use

- Google login, row-level security proven across two accounts
- `/log` — wake/sleep (24h), weight, blocker code + note, notes; activities
  with distance, duration (mm:ss) and pace; user-extensible sports; naps
  (recorded, never charted); editable activities
- `/days` — last 30 days, gaps visible
- `/` (Panel) — contribution grid with four honest states (not logged /
  rest / blocked / trained), weight with moving average and goal
  projection, this-week-vs-last bullet charts, sleep floating range bars
  against 07:00, "what stops you" blocker frequency, running pace inverted
  (faster = up), half marathon goal bar anchored at the first recorded
  half (2:10)
- Persistent nav: left sidebar on desktop, bottom bar on mobile, "Log
  today" action in the signal colour

**Dropped deliberately:** gym templates (notes are faster than dropdowns),
Strava (API is subscriber-only), Health Connect / Google Fit / Zepp
(on-device, no server read; a native app would be a month of rebuilding to
save ten seconds a day).

---

## 5. Spend side — FROZEN

**Spend tab frozen on 2026-10-26.** Spending is now tracked in the Wallet app
(BudgetBakers), connected to Claude via the Wallet MCP connector. Code and
tables are kept for reference; do not build on `/spend`.

The nav link is hidden, all `/spend` routes redirect to `/`, and the PWA
`start_url` points at `/log`. Nothing was deleted.

---

## 5a. Spend side — original shape (archived)

**`SPEND_RESEARCH.md` is still the source of truth**, modified by §3 above.
One hero number, a real weekly partition, targeted friction on two leaks,
no charts above the fold.

- `get_dashboard(p_today date)` — one RPC, security invoker. Splits OLD
  rules (cycles before 31 Oct 2026 — hero funded by the flat cap) from NEW
  rules (hero funded by in-cap category budgets only; Shopping becomes a
  sinking fund, excluded from spend totals). As of 0018, every category
  entry also carries a generic `sub` breakdown (Shopping's four
  sub-budgets; Food/Transport's spent-only sub-label totals) and Transport
  carries `paid_rides`.
- `/spend` — hero → Monday transfer card → this week's move → six bars
  sorted by overspend (Shopping's four sub-budgets as real indented bars
  under its parent, each with its own pace tick; Food/Transport get a
  spent-only sub-label line; Transport gets a "Paid rides" line) →
  emotion footnote → month strip → quick-add (shared component with
  `/spend/quick-add`, pure client state, no network per tap) → week nav,
  "Where it went", "Every spend this week" below the fold.
- `/spend/plan` — salary, investments, savings, shopping_accrual, weekly
  Food/Transport, monthly Fun/Subscriptions/Other, Shopping's four
  sub-budgets with a live sum-vs-accrual check (refused server-side too if
  they don't match), Unassigned (every cycle, correctly weighted, always
  excluding Shopping — see §3), balance snapshots with a visible
  "Saved Apex ₹X at 12:15 pm" confirmation.
- `/spend/waitlist` — 48-hour pause on Subscriptions (any amount) and
  Fun/Shopping over ₹1,500; server-enforced on real elapsed time.
- `/spend/review` — Sunday weekly review: under/over, leak of the week, a
  challenge keyed to the leak bucket, streak of weeks under.
- `/spend/quick-add` — PWA entry point, numeric keypad (hydration-gated,
  visibly dimmed until mounted, a visible "Max ₹9,99,999" instead of
  silently dropping taps at the cap), six always-shown chips with
  sub-label reveal, an "Apex · Today" chip for account/date, night-mode
  and waitlist interrupts, optional note, emotion picker on Fun/Shopping.
- `/spend/import` — Wallet CSV, dedupe, ghost-row detection, reconciliation
  check, category mapping updated for the six-category model.

### Phase 0 — outside the app (do once, highest value)
Require authentication for all Play/App Store purchases · remove saved
cards from Play and dating apps · lower the UPI per-transaction limit on
Apex · move dating apps off the home screen.

---

## 6. Hand-check list

- [ ] Keypad test: tap `1 2 1 2 1 2` quickly → shows exactly `121212`;
      reload, tap `1` once → shows `1`. (You already found two real bugs
      here once — confirm both fixes actually hold on your phone.)
- [ ] Tap a digit past the cap → shakes and shows "Max ₹9,99,999" instead
      of doing nothing.
- [ ] Tap "Apex · Today" → account + date pickers open; log a backfilled
      entry for yesterday on a non-Apex account.
- [ ] Tap Food, Transport or Shopping → sub-label chips appear; save once
      with a sub-label picked and once without (both must work).
- [ ] On `/spend/plan`, make Shopping's sub-budgets not sum to the
      accrual → Save is refused with the exact gap in rupees.
- [ ] A waitlist item over ₹1,500 locks for the full 48 hours — try Buy
      before it unlocks and confirm the server refuses it, not just the
      button being hidden.
- [ ] Install `/spend/quick-add` as a PWA and log one real spend through
      it.
- [ ] Log a Fun or Subscriptions entry between 22:00–06:00 IST and confirm
      the night-mode prompt appears.
- [ ] Tag an emotion on a Fun or Shopping entry.
- [ ] Open `/spend/review` on a Sunday.
- [ ] Tick the Monday transfer card.
- [ ] Enter the November plan values (`SPRINT_NOTES.md`, item 5) and
      confirm `get_dashboard('2026-10-31')` returns `new_rules: true` and
      `incap_total` close to ₹19,291.
- [ ] Import a fresh Wallet CSV and confirm categories/sub-labels land
      right (Taxi → Transport/Bike taxi, etc.) rather than under
      "Unrecognised Wallet categories."

---

## 7. Theme

Tron: Ares direction, approved and rolled out this round. One shared
near-black base for both app halves (`--bg #05070A`); fitness identity is
crimson (`--accent #FF2E4D`), spend identity is electric cyan
(`[data-spend] --accent #22D3EE`); `--signal` (ahead of pace, targets,
today) is ember orange (`#FF7A1A`, moved off amber this round). Crimson is
reserved on `/spend` for "over" only, never decorative. Per-sport colours
are a fixed six-colour palette plus a deterministic hash fallback
(`src/lib/sport-color.ts`) for any sport added later. `.glow-text` (a
static text-shadow, not animated) marks headings, hero numbers and active
nav only — never body text. `/theme-preview` is deleted; the direction
lives only in `globals.css` now.

---

## 8. Working agreement

1. **Sketch before building** anything touching schema, auth or a new
   module. Skip for changes under ~20 lines.
2. **One concern per commit. Always push.** Vercel deploys from GitHub; an
   unpushed commit is invisible.
3. **Migrations are run by hand** in the Supabase SQL editor, then
   committed. Claude Code cannot run DDL.
4. **Never use `auth.uid()` in SQL meant for the SQL Editor.** Use the
   literal user id:
   ```sql
   begin;
   select set_config('request.jwt.claims',
     '{"sub":"bff03fd3-1687-487a-b9ce-ef26ba1c553c","role":"authenticated"}', true);
   select get_dashboard(current_date);
   rollback;
   ```
5. **The SQL Editor shows only the last statement's result.** One
   diagnostic query per tab.
6. **Acceptance numbers are computed independently** of the parser, or the
   check proves nothing.
7. **Every save must surface errors.** Silent failures have cost the most
   time of any bug class here.
8. **Every picker is pure client state** (`useState`), no network/router/
   server-action call per tap — only a final Save submits. Confirmed
   app-wide this round; see `SPRINT_NOTES.md` item 2 if a lag ever shows
   up again.

---

## 9. Recurring bug classes

- **A control the server render depends on must not live inside the form
  that submits it.** Caused data loss on `/log`. In AGENTS.md.
- **Dates:** `toISOString()` is UTC; IST entries between 00:00 and 05:30
  land on the previous day. Build date strings from local parts.
- **Indian number formatting** (1,00,505) parses as NaN → 0 unless
  stripped (`parseMoney`).
- **`Intl.toLocaleTimeString`'s default hourCycle is h11, not h12`** —
  renders noon/midnight as `0:XX` instead of `12:XX`. Force `hourCycle:
  "h12"` explicitly.
- **A card with no data says so, never vanishes.**
- **Zero means null for measurements**, but `reps = 0` on a failed set is
  data.
- **Silent save failures** — every mutation forces `.select()` and treats
  "no error, no row" as its own failure.
- **A component defined inside another component's render body** is a
  new function identity every render; declare it at module scope.
- **Reading a ref's `.current` during render** doesn't update reactively —
  track the value in state instead.
- **A rejected input (a cap, a limit, an invalid value) must say so,
  never just do nothing.** A dropped tap and a tap that didn't register
  look identical to the person doing the tapping.
- **Client components are briefly non-interactive before hydration** —
  the keypad's early-tap bug. For anything tapped rapidly right after
  load, gate on a `mounted` flag (`useState(false)` + `useEffect(() =>
  setMounted(true), [])`) and dim/disable visibly until then, rather than
  letting pre-hydration taps silently vanish.

---

## 10. Training goals the app supports

168 cm, ~66 kg, recomposition. Six-month targets: waist −6–7 cm, weight
64–66 kg, 12 dips, 15 pull-ups, 5K sub-20. Half marathon 2:10 → sub-1:40 by
Sept 2027. **Wake target 07:00 — the keystone variable.** Late wake-ups
cost training time and, via bike taxis, money.

---

## Files in the repo root

`AGENTS.md` (rules for Claude Code) · `ARCHITECTURE.md` (fitness spec) ·
`RESEARCH.md` (dashboard design research) · `SPEND_RESEARCH.md` (spend
source of truth, as modified by §3 above) · `PHASE2.md` (fitness backlog) ·
`STATUS_latest.md` (this file) · `SPRINT_NOTES.md` (decision log — every
sketch, hand calculation and simplification made while building).

---

**Build phase complete. Next: one month of use before planning a native
app.**
