# Afterburner — Project Status & Handover

**Build phase complete.** Everything below is either live or waiting on
two migrations you haven't run yet (0017, 0018 — see §1). Once those run
and you've clicked through the hand-check list in §6, there's nothing left
to build before a month of real use.

Live at `afterburner-two.vercel.app` · repo `Grossundnett/afterburner` (private)
Supabase project ref `ijnemkslclmpjhewydkk`, region Mumbai (ap-south-1)
Vercel function region `bom1` — halved load time; never change it.
My Supabase user id: `bff03fd3-1687-487a-b9ce-ef26ba1c553c`
(Second test account: `d88c6d72-ab28-4b61-a241-46173f772060`)

---

## 1. Migrations — what's run, what isn't

| Migration | What it does | Status |
|---|---|---|
| 0001–0015 | Fitness schema, early spend schema | Run, live |
| 0016 `spend_sprint` | Balances grant, buffer→big_buy_accrual, transfers, emotion, waitlist, old/new-rules split | **Run, live** |
| 0017 `final` | Fixes incap_total/Unassigned to use Mom's-rule day-weight mass instead of plain weeks | **Written, pushed — confirm you've run it** |
| 0018 `categories` | Six-category model, Shopping sub-budgets, deletes late tax | **Written, pushed — NOT RUN** |

**Run 0018 before trusting anything category-related** — `/spend`'s bars,
`/spend/plan`'s budgets, and the Wallet import all still expect the old
fine-grained category keys until it's run (the code changes that depend on
it, item 4 of this round's brief, were deliberately held back and are
*also* not yet built — see §2).

Verify each ran:
```sql
-- 0017: get_dashboard includes Shopping in incap_total for OLD-rules cycles
begin;
select set_config('request.jwt.claims',
  '{"sub":"bff03fd3-1687-487a-b9ce-ef26ba1c553c","role":"authenticated"}', true);
select get_dashboard('2026-10-26');
rollback;
-- expect "unassigned" to be a real number, not equal to discretionary_cap

-- 0018: six categories, nothing else
select key, "group" from spend_categories
where user_id = 'bff03fd3-1687-487a-b9ce-ef26ba1c553c' order by sort;
-- expect exactly 6 rows: Food, Transport, Fun, Subscriptions, Shopping, Other
```

---

## 2. What's built this round, and what's deliberately still missing

This round (the "final build round" brief) shipped items 1, 2, 3, 6, 7, 8
in full. **Items 4 and 5 were held back on purpose** — they depend on
0018 being run, and the brief's one stop point was right after writing
that migration. Once you confirm 0018 ran, the next turn is:

- Item 4 — quick-add's six parent chips with sub-label reveal, the
  "Apex · Today" chip restoring account/date pickers, six top-level bars
  with Shopping's four sub-bars indented and a Food/Transport sub-line,
  "Paid rides" on Transport (the SQL side is already done in 0018 — the
  UI isn't).
- Item 5 — seeding the 31 Oct plan values (salary 1,00,505, investments
  55,000, savings 10,000, shopping_accrual 5,505, Food 1,800/wk, Transport
  800/wk, Fun 3,000, Subscriptions 1,000, Other 4,000, Shopping split
  Fitness gear 1,500 / Football 1,000 / Clothes & shoes 2,000 /
  Electronics 1,005) — can't be entered until item 4's `/spend/plan` UI
  understands sub-budgets.
- The Wallet CSV import mapping (`CSVImportClient.tsx`) still writes the
  *old* fine-grained category keys — bundled into the item-4 turn, since
  it also depends on 0018's schema.

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

## 5. Spend side — current shape

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
  sorted by overspend → emotion footnote → month strip → quick-add (shared
  component with `/spend/quick-add`, pure client state, no network per
  tap) → week nav, "Where it went", "Every spend this week" below the fold.
- `/spend/plan` — salary, investments, savings, shopping_accrual, weekly
  Food/Transport, monthly Fun/Subscriptions/Other, Unassigned (every
  cycle now, correctly weighted), balance snapshots with a visible
  "Saved Apex ₹X at 12:15 pm" confirmation.
- `/spend/waitlist` — 48-hour pause on Subscriptions (any amount) and
  Fun/Shopping over ₹1,500; server-enforced on real elapsed time.
- `/spend/review` — Sunday weekly review: under/over, leak of the week, a
  challenge keyed to the leak bucket, streak of weeks under.
- `/spend/quick-add` — PWA entry point, numeric keypad, hour-ranked chips,
  night-mode and waitlist interrupts, optional note, emotion picker on
  Fun/Shopping.
- `/spend/import` — Wallet CSV, dedupe, ghost-row detection, reconciliation
  check. **Still writes old category keys — item 4's turn fixes this.**

### Phase 0 — outside the app (do once, highest value)
Require authentication for all Play/App Store purchases · remove saved
cards from Play and dating apps · lower the UPI per-transaction limit on
Apex · move dating apps off the home screen.

---

## 6. Hand-check list — click through these after 0018 runs

- [ ] Keypad test: tap `1 2 1 2 1 2` quickly → shows exactly `121212`;
      reload, tap `1` once → shows `1`.
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
- [ ] Enter the November plan values (§2) once item 4 ships, and confirm
      `get_dashboard('2026-10-31')` returns `new_rules: true`.

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
