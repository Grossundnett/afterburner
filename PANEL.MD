# Panel v2 — what to build

The weight card works. This is what makes the Panel worth opening daily.
Build all of it in one session. Don't stop between cards.

---

## First: fix the axis

The x-axis currently spans the full 90-day window (4 Jul – 1 Oct) even though
data starts in September, so the chart is mostly empty. The axis must span
**first data point → today**, as originally specced. The 90 days is how far back
we *look*, not what we *draw*.

---

## Make it brighter

The current palette is deliberately restrained and it reads as washed out on
charts. Three changes, no new tokens:

1. **Lines at full accent strength**, not muted. Weight uses the body slate;
   give it `--accent` at 100%, 2px stroke, round caps.
2. **Gradient fill under every line** — accent at 18% opacity fading to 0% at
   the bottom. One `<linearGradient>` def, reused. This is the single biggest
   visual improvement for the least code.
3. **Data points as filled circles**, 3.5px, accent, with a 2px background-
   coloured ring so they read against the line.

Cards keep `--surface` and the 1.5px `--line` border. Don't add shadows or
gradients to the cards themselves.

---

## The cards, in build order

### 1. Weight — upgrade the existing card

Add three things:

- **A 7-day moving average** drawn over the raw points, 2px solid accent, with
  the raw points dropped to 40% opacity. Daily weight is mostly water and food
  timing; the average is the signal. This is the single most useful change.
- **A goal line at 60 kg** — dashed, 1.5px, `--signal` amber, labelled "goal" at
  the right end. He has a target; the chart should show it.
- **Delta since start**, next to the big number: "−2.1 kg since 2 Sept" in
  accent if falling, muted if flat.

### 2. Contribution grid

7 rows × 13 columns, one cell per day, most recent on the right.

- Cell colour by total activity minutes that day, 5 steps from `--surface` to
  full accent using `color-mix`.
- 3px gaps, 4px radius, ~22px cells.
- Today gets a 2px `--signal` outline.
- Weekday labels on the left (M W F only, to save width).
- Below it: **current streak** and **longest streak** as two big mono numbers.

This is the most motivating thing on the page. Build it second, not last.

### 3. This week vs last week

Four tiles in a 2×2 grid. Each: muted 13px label, 28px mono value, and a small
delta line underneath in accent (better) or muted (worse).

- Kilometres run
- Sessions trained
- Average wake time
- Average sleep duration

Comparison motivates more than absolutes. "18 km, +4 on last week" lands harder
than "18 km".

### 4. Sleep & wake

One chart, two series:

- **Wake time** — accent line. Do NOT pass through `unwrapClockHours`.
- **Sleep time** — second line, DO unwrap (02:00 → 26:00).
- **A shaded band** across the 07:00 wake target, `--signal` at 12% opacity.
- Below the chart: **sleep duration** as thin vertical bars, with a dashed line
  at 7 hours.

Days where wake is above the band are the ones that matter — this is the
discipline layer, and it should be obvious at a glance whether the week was good.

### 5. What stops you

A horizontal bar chart of blocker codes over the last 90 days, most frequent
first. Label, bar, count.

There's a month of this data already and nothing has ever shown it back. It's
the closest thing to insight the app currently has, and it needs no AI.

### 6. Running

- **Pace over time** — line. **Invert the y-axis**: lower is faster, so an
  improvement must go UP. Label it "pace (faster ↑)" so it can't be misread.
- **Distance per run** — bars beneath, sharing the x-axis.
- Big number: best 5K in the window.

---

## Layout

- Mobile: single column, cards stacked, each 120–140px of chart height.
- Desktop (≥900px): two columns. Weight and the grid full width at the top,
  the rest in two columns beneath.
- Card order on mobile: grid, weight, this-week, sleep, blockers, running.
  The grid goes first because it's the one that makes you want to log tomorrow.

---

## Non-negotiables carried over

- Server Components, inline SVG, no Recharts, no client JavaScript.
- x scaled by date, never array index.
- Break lines across gaps >7 days (>3 for sleep/wake).
- Always draw the points, not just the line.
- Every chart has a `<title>` for hover text and screen readers.