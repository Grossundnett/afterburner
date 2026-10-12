# Fitness/Habit Dashboard Brief: Performance, Data-Viz Design and Loading Feedback

The slowness is very likely caused mainly by where things run, not by React rendering. Vercel puts new projects' functions in Washington, D.C. (iad1) by default, while the database is in Mumbai. Each of the Panel's 6+ Supabase calls, plus the auth check, crosses that gap, and sequential awaits multiply the cost. Fix the region first, then the auth call, then the query fan-out. After that, redesign the cards around "one coloured verdict per card" in the style of WHOOP, Oura and Strava, so the user can read the dashboard at a glance.

## TL;DR

- **Performance:** Set the Vercel function region to `bom1` (Mumbai). In Parveen Kumar's write-up on a Next.js app with a Mumbai database, moving from iad1 to bom1 took typical API latency from "~800ms+" to "~100ms". Replace `supabase.auth.getUser()` with `getClaims()` and asymmetric JWT keys. Collapse the 6+ queries into one `Promise.all` or a single Postgres RPC. Wrap each card in its own `<Suspense>` so slow cards stream in late instead of blocking the page. Supavisor pooling mostly doesn't matter here, because `@supabase/ssr` talks HTTP to PostgREST, not raw Postgres.
- **Design:** Give every card a headline number with a status colour, a comparison to the user's own baseline, and a plain-language sentence. Use bullet charts for week vs last week, floating range bars for sleep, a sequential calendar heatmap that separates "rest" from "not logged", and a weight line with a dashed projection to the goal. On the dark background, use lighter, slightly desaturated hues (Tailwind 400-level). Check every data mark against WCAG 1.4.11's 3:1 non-text contrast rule.
- **Feedback:** Use `useActionState`/`useFormStatus` for the button's pending state and `useOptimistic` for instant UI. Call `updateTag()` in the Server Action so the dashboard shows the new data right away. Keep the button focusable with `aria-disabled` rather than `disabled`, and announce state through a polite live region that exists on page load. Show skeletons only for waits of 1–10 seconds, shaped like the real cards.

---

## Key Findings (prioritised by likely impact)

| # | Finding | Expected impact | Effort |
|---|---|---|---|
| 1 | Function region is probably iad1, database is in Mumbai. Every round trip crosses continents. | Very high: hundreds of ms per query, multiplied by query count | 5 minutes plus a redeploy |
| 2 | `getUser()` makes a network call to Supabase Auth on every call, in proxy/middleware and in the page | High: about 230–500 ms per call measured in one project | Low, but needs asymmetric keys |
| 3 | 6+ queries, probably awaited one after another | High: sum of round trips instead of the slowest one | Low (`Promise.all`) to medium (RPC) |
| 4 | Whole page blocks until every query finishes | High for how fast it *feels* | Low (`<Suspense>` per card) |
| 5 | Nothing is cached, though the data changes only when the user logs something | Medium–high on repeat visits | Medium (Cache Components and `updateTag`) |
| 6 | Free-tier nano compute and pausing after 7 days | Low per request; matters only for heavy aggregation or after a pause | Use SQL and indexes well |
| 7 | Multiple font families | Low–medium (LCP/CLS, not TTFB) | Low |

---

## Area 1 — Web Performance

### 1.1 Function region vs database region (the #1 suspect)

- **Default:** Vercel's docs say "By default, Vercel Functions execute in Washington, D.C., USA (iad1) for all new projects." You can change this in project settings, in `vercel.json` with `regions`, through the CLI, or per function with the `functions` property.
- **How to set it on Hobby:** Go to Project → Settings → Functions → Function Region → Mumbai (`bom1`). Or add this to `vercel.json`:
  ```json
  { "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["bom1"] }
  ```
  You must **redeploy** for the change to take effect. One developer reports that the setting appeared broken until they shipped a new deployment. Multi-region functions are a Pro/Enterprise feature, so on Hobby you pick one region. Pick the database's region.
- **Measured difference:** Parveen Kumar's write-up, "How to Change the Vercel Server Region for Next.js Projects", describes a Next.js App Router app with a Mumbai database and functions in iad1. Its before/after table reads "Typical API latency | ~800ms+ | ~100ms" after moving from iad1 to `bom1`. That was MongoDB, not Supabase, and a single anecdote, but the physics is the same. Vercel's own guidance: "A server function that makes three database round trips from a region far from the database pays that latency three times, while a user-facing response pays the user-to-region latency once." Vercel also warns that "If your functions communicate with external services, choosing regions far from those services increases latency."
- **Why this is worse for the Panel:** The page makes 6+ queries plus an auth call. Run in sequence across that gap, they add up to well over a second before any HTML exists. Moving the function next to the database turns each round trip from intercontinental to in-region. Even if the user is far from Mumbai, they pay the long hop only once.
- **Middleware/proxy caveat:** Vercel "deploys Routing Middleware to all regions by default, regardless of your region settings," and on Hobby it runs in fewer regions. Any Supabase call in `proxy.ts`/middleware runs at the edge location, far from the database. Keep middleware free of network calls (see 1.2).

### 1.2 Auth: `getUser()` vs `getClaims()` (commonly missed TTFB cost)

- `getUser()` "always sends a request to the Auth server for each JWT." `getClaims()` verifies the JWT against the project's JWKS, "which is often cached, resulting in significantly faster responses." Supabase's reference docs say to prefer it.
- **Requirement:** `getClaims()` verifies locally only with **asymmetric JWT signing keys** (ECC/RSA). With the legacy symmetric secret, "it always sends a request to the Auth server (similar to GoTrueClient.getUser)." Migrate in Supabase Dashboard → Settings → JWT signing keys. Supabase describes the migration as safe and reversible with zero-downtime key rotation.
- **Measured:** In the sumeet-spec/Sendkar project on GitHub, PR #5 ("perf: getAuthedClient uses getClaims() instead of getUser()") found that `getUser()` "still cost ~230-500ms on every single call, cold or warm." `getClaims()` cost "~500ms on a cold function (one-time JWKS fetch), then ~0-1ms on every call after that within the same warm instance." The project's earlier PR #4 had "collapsed 3 sequential queries into 1 (~1.4s → ~170ms)".
- **Pattern:** Call `getClaims()` once per request inside a `React.cache()`-wrapped helper, so every Server Component that needs the user shares one result. A separate Next 16 issue describes the anti-pattern exactly: `proxy.ts` running `getUser()` "for every request the matcher lets through. That's every page, RSC payload, prefetch and server-action POST."
- **Trade-off:** `getClaims()` won't notice a ban, deletion or sign-out until the JWT expires (up to about 1 hour). For a single-user personal app, that's an easy trade.

### 1.3 Sequential vs parallel fetching (waterfalls)

- Next.js docs: "Any fetch requests with await will block rendering and data fetching for the entire tree beneath it, unless they are wrapped in a `<Suspense>` boundary or loading.js is used." The fix is to start every independent request at once and await them together:
  ```ts
  const [days, activities, weights, sports] = await Promise.all([
    getDays(uid, range), getActivities(uid, range), getWeights(uid, range), getSports()
  ])
  ```
  Total time becomes the slowest request, not the sum. Use `Promise.allSettled` if one card failing shouldn't take down the rest. In Next 16, `params`/`searchParams` are async, so include them in the same `Promise.all` instead of awaiting them first.
- **Better still: one round trip.** Write a Postgres function, e.g. `get_dashboard(p_from date, p_to date)` returning JSON, and call it with `supabase.rpc()`. It can do the aggregation (streaks, 7-day moving average, week-vs-week totals, blocker counts) inside Postgres and return only what the charts need. Fewer rows cross the wire, and the work happens next to the data. In the Sendkar project, PR #4 "collapsed 3 sequential queries into 1 (~1.4s → ~170ms)".
- **How to detect waterfalls:**
  1. Wrap each query in `performance.now()` timings and log start and end offsets. Overlapping intervals mean parallel; a staircase means a waterfall.
  2. Read the code for `await` statements in sequence, or in parent and child components where the child's fetch only starts after the parent finishes rendering.
  3. Compare the summed timings with the total function duration in Vercel's logs.
  4. Always measure a production deployment, never `next dev`.

### 1.4 Connection pooling (Supavisor/PgBouncer): relevant only if you bypass the Data API

- **Key point for this stack:** `@supabase/ssr` / `supabase-js` query through Supabase's **Data API (PostgREST over HTTPS)**. Supabase manages those database connections server-side, so the app never opens a Postgres connection and pooler settings don't affect it. Pooling only matters if you add Drizzle, Prisma or `postgres.js` with a `DATABASE_URL`.
- **If you do add a direct driver:** Supabase's docs say to use the shared pooler in **transaction mode** for "serverless and edge functions, which open many short-lived connections." The connection string is `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-[INDEX]-[REGION].pooler.supabase.com:6543/postgres`. "Turn off prepared statements, which transaction mode doesn't support."
  - Port 6543 is transaction mode only. Supabase deprecated session mode on port 6543 on February 28, 2025. Session mode lives on 5432.
  - The shared pooler is IPv4 on every plan. The dedicated PgBouncer pooler (`db.[ref].supabase.co:6543`) is paid-tier only.
  - Common ORM advice is `connection_limit=1` per serverless instance.

### 1.5 Caching in Next.js 16 (Cache Components)

- **Model change:** With `cacheComponents: true` in `next.config.ts`, data is **dynamic by default** and you opt in with the `'use cache'` directive at file, component or function level. Next.js builds the cache key from the function and its serialised arguments.
  - `experimental.ppr` has been removed and folded into Cache Components. `experimental.dynamicIO` was renamed `cacheComponents`.
- **Old → new API mapping (from Next's migration guide):**
  - `unstable_cache` is replaced by `'use cache'`. The key-parts array goes away, and the options become `cacheLife()` and `cacheTag()`.
  - `export const revalidate = 3600` becomes `cacheLife('hours')`.
  - `fetch(..., { next: { revalidate, tags } })` becomes `'use cache'` plus `cacheLife`/`cacheTag`.
- **Invalidation:**
  - `revalidateTag(tag, profile)` now *requires* a second argument.
  - The new `updateTag(tag)` works only in Server Actions. It "expires the cache and immediately reads fresh data within the same request". That gives read-your-writes after the user logs a run or a weight.
- **Per-user authenticated pages: the trade-off.**
  - `'use cache'` functions **cannot call `cookies()`/`headers()`**, so the cookie-based Supabase client can't run inside one. The documented pattern is to read the user outside, then pass `userId` (and the date range) in as arguments so they become part of the cache key.
  - Inside the cached function, you need a Supabase client that doesn't depend on request cookies. A service-role client bypasses RLS, so the `userId` filter becomes your only security boundary. Keep that server-only and audit it.
  - `'use cache: private'` caches per user and may read request APIs. However, its results "are not stored in a server cache across production requests". One migration guide also states it "is not recommended for production in Next.js 16.2.10". A reported bug in 16.0.1 showed it re-running on every client navigation. **Don't depend on it yet.**
  - **Recommendation for a single-user app:** Cache aggregated dashboard data with `'use cache'` keyed by `userId`, plus `cacheTag(\`user:${uid}:dashboard\`)` and a long `cacheLife` such as `'days'`. Call `updateTag` in every logging Server Action. Repeat visits then skip the database entirely. Do this *after* fixes 1.1–1.3, because cache misses still pay the full cost.
- **PPR, now "static shell + dynamic holes":** Anything not cached and not request-dependent, such as the page chrome, card frames and headings, gets prerendered into a static shell. Request-dependent parts stream into `<Suspense>` holes. On this page, the header and card skeletons can go out instantly from the CDN.

### 1.6 Streaming: `loading.tsx` vs granular `<Suspense>`

- `loading.tsx` "is nested inside layout.js and wraps page.js in a `<Suspense>` boundary". That's a whole-page skeleton. Next's streaming guide warns that a `loading.js` placed high in the tree makes "the entire page [fall] back to a full-page skeleton instead of streaming granularly."
- **The right pattern for the Panel:** Make each card an `async` Server Component that awaits its own (deduplicated, cached) data, and wrap each one in its own `<Suspense fallback={<CardSkeleton variant="weight" />}>`. Siblings resolve independently, so the fast KPI tiles appear first and the heavier heatmap streams in later. Use a route group (`app/(panel)/loading.tsx`) if you want a navigation skeleton that doesn't leak into other routes. Next's dashboard tutorial shows this fix.
- **Avoid a new waterfall:** If each card fetches its own data, start all the fetches at the top of the page without awaiting them. Pass the promises down, or use a `React.cache()`-wrapped loader. Otherwise the per-card fetches can end up in series again.
- Streaming adds no client JavaScript beyond React's inline swap scripts, so the zero-client-JS goal holds.

### 1.7 Supabase free tier (nano) realities

- **Compute:** The pricing page lists the Free plan as "Shared CPU • 500 MB RAM". Supabase's own "Compute and Disk" docs list Nano (free) as "Shared" CPU with "Up to 0.5 GB" memory, a 500 MB recommended maximum database size, 60 maximum direct connections and 200 pooler clients. Shared CPU means heavy queries (full-table scans, `generate_series` streak calculations over years of data) can be noticeably slow and noisy. Make sure `(user_id, date)` indexes exist on `days`, `activities` and `body_metrics`, and check plans with `EXPLAIN ANALYZE`.
- **Pausing:** "Free projects are paused after 1 week of inactivity." Inactivity means no *database* activity. A paused project isn't a per-request cold start: the database stays down until you restore it. One blog claims the first request after a pause "takes 10–30 seconds to cold-start". Other sources say you have to restore it manually. **Treat the 10–30 s figure as unverified.** For a daily-use personal app, pausing shouldn't happen. If usage gaps happen (holidays), a daily cron that writes a heartbeat row keeps the project awake. Paid plans are never paused.
- **Function cold starts are a separate issue:** The Vercel function's cold start plus the first JWKS fetch (about 500 ms in the PR above) hit the first request after idle. With a single user, many visits will be cold. That's another reason to cache, and to keep the static shell prerendered so something paints immediately.

### 1.8 Fonts

- Next's guidance: "Use variable fonts for the best performance and flexibility. They support multiple weights and styles in a single file." Also: "Use multiple fonts conservatively since each new font is an additional resource the client has to download."
- `next/font/google` self-hosts at build time, so there's no request to Google at runtime. Always set `subsets: ['latin']`. With the default `preload: true`, each font gets a `<link rel=preload>`, so preloading 3 families competes with critical CSS. Set `preload: false` on secondary fonts and keep the automatic fallback metrics (`adjustFontFallback`) to avoid CLS.
- **Recommendation:** One variable sans (e.g. Inter or Geist) and, at most, one variable mono for tabular numbers. For numbers, `font-variant-numeric: tabular-nums` on the sans is often enough, so you may not need the second family. Fonts affect LCP/CLS, not TTFB, so they won't fix the main slowness.

### 1.9 Other commonly missed TTFB causes in this stack

- Sequential `await`s across layout and page: the layout fetching the user, then the page fetching data.
- `getUser()` in both proxy and page, which means double the auth calls.
- Over-fetching: `select('*')` across all history when charts only need 12 weeks. Filter by date range and select only the columns you need.
- Doing JavaScript aggregation over thousands of rows on a cold function instead of in SQL.
- Measuring on `next dev`, which compiles on demand and is not representative.

---

## Area 2 — Dashboard & Data-Visualisation Design

### 2.1 What the well-regarded apps actually do (techniques to borrow)

| App | Technique | Source detail |
|---|---|---|
| **WHOOP** | Many signals compressed into **one 0–100 score with a traffic-light band**: green 67–99%, yellow 34–66%, red 1–33%. Three dials at the top (Sleep, Recovery, Strain), with deeper detail one tap down. Streak counter next to the profile. | WHOOP's Home screen documentation. A reviewer could recall "how many 'red' days I've had this week" but "I don't recall a single readiness score from Oura". The colour verdict sticks in memory. |
| **Oura** | Scores 0–100 with **named bands**: 85–100 Optimal, 70–84 Good, 60–69 Fair, 0–59 Pay Attention. Each score breaks down into **contributors**, each judged against **your own baseline** (14-day weighted averages). Oura Support's "Readiness Contributors" page says "It can take up to two weeks for the Oura App to learn your average values for each contributor", that "'long-term' refers to personal data collected over the past two months", and that "Scores below 70 indicate that you may benefit from prioritizing rest". | Oura Support. Some users find it gentler and more sustainable psychologically than a daily red verdict. |
| **Apple Fitness** | Three coloured rings (red Move, green Exercise, blue Stand). "An overlapping ring means you exceeded your goal", so going past 100% stays visible instead of being capped. **Trend arrows** compare the last 90 days with the last 365, with a coaching line such as "Walk an extra quarter mile a day." | Apple Support. Trends need 180 days of data. |
| **Strava** | **Relative Effort**: a weekly cumulative line plus a **white "suggested range" band from your three-week average**, with plain-language states: "Within range", "Above range… be sure to follow them with proper recovery", "Below range: You're taking it easy. (This isn't a bad thing.)" Fitness & Freshness shows a **7-day fitness delta** and advises that "the overall numbers aren't as important as general trends." | Strava Support. A 2018 Strava article said the band came from a 12-week average; current Support says three weeks. Treat Support as current. |
| **Exist.io** | Daily progress bars **relative to your average for that day of the week**. Goals set "based on my average for this day of the week over the past 90 days." Plain-language insights such as "highest or lowest… in however many days". Correlations explicitly labelled "Correlation is not causation." | Exist developer docs and blog. |

**What the five have in common:**
1. One big number per domain, with a categorical verdict colour.
2. The comparison is to *your own* baseline, not a population norm.
3. A plain-language sentence says what it means.
4. Detail is one level down.
5. Exceeding a goal is celebrated visually, not clipped.

The current Panel shows raw charts without verdicts, which explains much of "dull" and "hard to read".

**Mapping to this app, card by card:**
- **Header strip:** 3 "dials" in WHOOP style: Training this week (sessions or minutes vs a 3-week-average band), Sleep (last 7 nights' average vs target), Weight (trend vs goal). Each gets a status colour and a one-line sentence, e.g. "2 sessions above your usual week" or "Sleep 25 min short of target this week".
- **Streak:** show the current streak and the longest streak as large numbers. Mark "rest" days distinctly so a planned rest doesn't read as failure, echoing Strava's "This isn't a bad thing."

### 2.2 Chart type per card (beyond line charts)

| Card | Recommended encoding | Why / how |
|---|---|---|
| **Contribution grid** | Keep the **calendar heatmap**, but use a 4–5-step *sequential* ramp where brightest means most. Carbon: "In dark themes, the lightest color denotes the largest values." Use a **distinct treatment for "not logged"** (e.g. outline only, or a 1px dotted cell) vs "logged rest" (dim neutral fill) vs "blocked" (small accent dot). | Separates "no data" from "zero", which is the honest-gaps principle (2.6). Weeks as columns, so 12–16 weeks fits 350px at about 18px cells. |
| **This week vs last week** | **Bullet charts** (Stephen Few): one bar for this week, a tick for last week or the target, and 2–3 background bands for qualitative ranges. Alternatively, **dumbbell rows** (two dots joined by a line) for several metrics at once. | Few designed bullet graphs to replace space-hungry gauges. His spec uses shades of one hue/grey for the ranges for colour-blind safety. Several stacked rows fit the space of one gauge. |
| **Sleep & wake** | **Floating range bars**: one vertical bar per night from bedtime to wake time. Draw the target window as a translucent horizontal band. Colour each bar by whether it hit the target. Missed nights stay empty (no bar). | Shows duration *and* timing consistency in one mark. Easier to read than two lines. |
| **Blockers** | Horizontal bars **sorted descending, directly labelled** with count and percentage at the bar end, with no axis. Optionally a **waffle** (10×10) for "share of missed days by reason". | Direct labels remove the legend lookup. Horizontal bars handle long category names on mobile. |
| **Weight trend** | Raw weigh-ins as small faint dots. A bold **7-day moving-average line**. A goal line labelled at the right edge. A **dashed projection** from the current trend to the goal date ("At this rate: goal by 14 Dec"), turning amber or red if the trend moves away from the goal. | A projection is the strongest "on track / off track" signal. A bold average over faint raw points is honest about noise. |
| **Running pace/distance** | **Small multiples** or two stacked panels sharing an x-axis: distance as columns, pace as dots plus a trend line. For pace, invert the axis or label it "faster ↑" so up means good. | Avoids dual-axis confusion. Readers expect up to mean better. |
| **KPI tiles** | **Sparkline** (last 8–12 weeks) under each big number, with the last point highlighted and labelled. | Gives context in about 40px of height. |
| **Goal progress** | **Progress ring** only for a single bounded daily or weekly target, letting it overflow past 100% like Apple's overlapping ring. Otherwise use a bullet bar. | Rings use space poorly for comparison; use them sparingly as the "hero". |

**Ridgeline plots and stacked area:** Ridgelines (e.g. pace distribution by month) look striking, but need about 8+ rows and plenty of height. Leave them off the 350px main view and consider them for a desktop "insights" page. Stacked area suits minutes by sport per week. Limit it to ≤4 categories, or the upper layers become unreadable.

### 2.3 Colour on dark backgrounds: vibrant but readable

- **Surfaces:** Avoid pure black. Material's dark-theme surface is `#121212`. Build 3 elevation steps, e.g. `#121212` page, `#1E1E1E` card, `#2A2A2A` raised. A slate alternative is `#0F172A` / `#1E293B` / `#334155`. Body text: off-white (about 87% opacity, or `#E0E0E0`), not `#FFFFFF`.
- **Hue strategy (Datawrapper):** On white, choose colours that stay saturated while dark (blue, purple, red). "In dark mode, clothe the same data in colors that can be highly saturated while being bright: yellow, green, or orange." This is how to get "energetic" on dark without neon glare.
- **Saturation guidance (sources disagree on the amount):** Different guides recommend reducing saturation by **10–15%** (with lightness +5–8%), **15–25%**, or **20–30%** compared with the light-mode version. All agree the direction is lighter and somewhat less saturated, and that saturated yellow is the worst offender, so shift warnings toward amber. Practical rule: start from Tailwind's **400** step and check contrast.
- **A concrete energetic palette for this app, built on Tailwind 400-level hues:**
  - Primary / training: blue-400 `#60A5FA` or indigo-400 `#818CF8`
  - Success / on track: green-400 `#4ADE80` or emerald-400 `#34D399`
  - Warning: amber-400 `#FBBF24`
  - Error / off track: red-400 `#F87171`
  - Add an orange and a pink/magenta for categories, e.g. sports.
  - Reserve the brightest colour for the single most important mark in each card; draw context in grey (`#6B7280`-ish).
- **Colour-blind-safe categorical alternative: Okabe-Ito.** Hex values and approximate contrast against `#121212` (calculated with the WCAG formula; no published table exists):

  | Colour | Hex | ≈ Contrast vs #121212 | Meets 3:1? |
  |---|---|---|---|
  | Yellow | `#F0E442` | 14.2:1 | Yes |
  | Orange | `#E69F00` | 8.3:1 | Yes |
  | Sky blue | `#56B4E9` | 8.1:1 | Yes |
  | Reddish purple | `#CC79A7` | 6.1:1 | Yes |
  | Bluish green | `#009E73` | 5.5:1 | Yes |
  | Vermilion | `#D55E00` | 4.8:1 | Yes |
  | Blue | `#0072B2` | 3.6:1 | Borderline; avoid on `#0F172A` |

  Replace Okabe-Ito's black with white on dark. Orange and sky blue have similar lightness, so pair them with shape or position differences.
- **IBM Carbon dark-theme option:** Carbon publishes a separate dark-theme categorical palette starting Purple 60 `#8a3ffc`, Cyan 40 `#33b1ff`, Teal 60 `#007d79`. Its team found "the dark theme palette performed much better than the one for the light theme" for meeting 3:1. Carbon's dark backgrounds are `#161616` / `#262626`. Check the full sequence on Carbon's site before adopting it; only the first three values were confirmed.
- **Accessibility floor:** WCAG 2.1 SC 1.4.11 (AA) requires "a contrast ratio of at least 3:1 against adjacent color(s)" for "Parts of graphics required to understand the content". The 3:1 threshold "should not be rounded (e.g. 2.999:1 would not meet the 3:1 threshold)". The W3C also notes it is best "to avoid particularly thin lines". In practice, use ≥2px strokes for data lines, and never let colour be the only signal: pair status colour with an icon, arrow or word ("On track").
- **Sequential ramps on dark** (heatmap, intensity): go from a dim desaturated version of the hue (just above the card surface) to a bright, saturated end. 4–5 steps. The lowest "has data" step must still reach 3:1 against the card, or "light activity" looks the same as "no data".

### 2.4 Mobile at about 350px

From Datawrapper's practice:
- **Label directly** instead of using legends. On narrow screens, Datawrapper moves line labels into a colour key at the top because the label margin is "ignored" on mobile.
- **Hide the least important annotations or move them below the chart** on mobile.
- **Drop axis titles.** Put the unit in the card title or subtitle instead ("Weight, kg · 7-day avg"). Datawrapper omits axis labels by design because outside labels "take away valuable space – especially on narrow mobile phones," and rotated labels make readers "tilt their heads".
- **Switch to bars when labels are long:** "consider using another chart type (like a bar chart instead of a column chart)."

**What to keep and drop at 350px:**
- Keep: the latest value, labelled at the line's end; the goal line; 3–4 y-axis gridlines at most, labelled inside the plot.
- Drop: x-axis labels except the first and last, or month starts only.
- Show 8–12 weeks, not all history. Raise the hit target for any tap-to-inspect to ≥24×24px.
- Server-rendered SVG with `viewBox` and `preserveAspectRatio` scales, but text inside scales too. Render separate layouts per breakpoint, e.g. a mobile `<svg>` and a desktop `<svg>` toggled with Tailwind `hidden md:block`. This keeps font sizes at 11–12px or above without client JavaScript.

### 2.5 Data-ink minimalism vs engagement

- **Evidence:** Bateman et al., "Useful Junk?" (CHI 2010), compared embellished charts (Nigel Holmes style) with plain ones. Interpretation accuracy for the embellished charts "was no worse than for plain charts". Recall "after a two-to-three-week gap was significantly better". Participants also rated them more attractive.
  - **Limits:** the study had 20 participants and used small datasets with no time limit.
  - Li & Moacdieh (2014) extended it to larger datasets (10+ points) with time limits. They found that time limits affected comprehension and that chart type affected short-term recall.
  - Stephen Few's critique argues the recall benefit is only useful when the embellishment supports the message.
- **Position for this app:** Keep the *charts* Tufte-lean: no 3D, no heavy gridlines, no decorative fills behind lines. Put the "engagement ink" into **data-bearing** elements:
  - big numbers and verdict colours
  - status icons and arrows
  - streak flames or trophies that *encode* real achievements, such as a new longest streak or a personal-best pace
  - celebratory states when a ring overflows

  This matches what the Bateman study suggests helps (memorable, message-aligned embellishment) and what WHOOP, Apple and Strava do.

### 2.6 Honest handling of sparse or missing data

- **Don't interpolate across gaps by default.** Datawrapper: "When you have missing data points, you can't always assume that the data developed smoothly between the data points that exist. The missing data might be strong outliers."
  - Break the line at missing values. In SVG, start a new `M` subpath instead of continuing the `L` commands.
  - If you do bridge a gap (e.g. in a weight trend), draw the bridge **dashed** and show **point markers on real measurements**, so readers can see which points are real.
- **Present but diminished:** Stephanie Evergreen's rule is to note missing data "in a diminished way, but still present and not ignored." Practical options:
  - Grey hatching or faint background bands for "no data" stretches in the sleep chart.
  - An "n = 4 of 7 nights logged" subtitle.
  - Moving averages that **require a minimum number of points**: only draw the 7-day average if ≥4 values exist in the window.
- **In the heatmap:** separate "not logged", "logged: rest", "logged: blocked" and "logged: trained" with distinct visual treatments (2.2). This is the biggest honesty fix, because today a missing day probably looks like a failure.

### 2.7 Motion: what helps comprehension vs what's decoration

- **Helps:**
  - A one-time entrance that builds the chart in reading order, e.g. bars growing from the baseline or the weight line drawing left to right.
  - A changed number briefly highlighted after a save.
  - A ring filling to its value.
  - Keep it short (about 300–600 ms), run it once, and never loop it on a data view.
- **Decoration:** looping pulses, idle shimmer on loaded content, parallax.
- **Performance-safe techniques, with zero client JavaScript (pure CSS works on server-rendered SVG):**
  - Animate **`transform` and `opacity`**. These are "the only two to animate" on the compositor thread without layout or paint.
  - For bars, use `transform: scaleY()` with `transform-origin: bottom` and `transform-box: fill-box` on the SVG `rect`.
  - The `stroke-dasharray`/`stroke-dashoffset` "line draw" for the weight line and rings **triggers paint on each frame**. That's fine for a handful of paths, but not for hundreds of heatmap cells. Fade the heatmap in with opacity, staggering by column with `animation-delay`.
- **Always gate motion:**
  ```css
  @media (prefers-reduced-motion: reduce) {
    svg * { animation: none !important; transition: none !important; }
    .line-draw { stroke-dashoffset: 0; }   /* show final state */
  }
  ```
  Or author the animations inside `@media (prefers-reduced-motion: no-preference)` so the default is no motion.

---

## Area 3 — Loading States, Feedback & Perceived Performance

### 3.1 React 19 / Next 16 primitives: what each is for

| API | Package | Use it for | Gotcha |
|---|---|---|---|
| `useActionState(action, initial)` | `react` | Form plus Server Action: returns `[state, formAction, isPending]`. Holds the action's return value (errors, "saved" message) and the pending flag. | Replaces React 18's `useFormState` (from `react-dom`). |
| `useFormStatus()` | `react-dom` | A reusable `<SubmitButton>` that reads `{ pending, data, method }` of its **parent** `<form>`. | Must be rendered *inside* a child of the `<form>`. Called in the component that renders the form, `pending` is always false. |
| `useOptimistic(state, updateFn)` | `react` | Show the result *before* the server confirms, e.g. the new run appears in the list or the heatmap cell lights up. Reverts automatically if the action throws. | Call it inside an Action/transition. Mark optimistic items (e.g. reduced opacity) until confirmed. |
| `useTransition()` | `react` | Pending state for non-form triggers (button `onClick`, toggles) that call Server Actions. | `useActionState` already wraps form actions in a transition. |
| `updateTag(tag)` | `next/cache` | Inside the Server Action after the write, so the redirected or refreshed dashboard shows fresh data in the same request. | Server Actions only. Use `revalidateTag(tag, profile)` where eventual consistency is acceptable. |

**Recommended save pattern for log forms:**
1. `<form action={formAction}>`, where `formAction` comes from `useActionState(saveRun, initial)`.
2. A `<SubmitButton>` using `useFormStatus` switches its label to "Saving…" at once (well under 0.1 s, since it's client state).
3. `useOptimistic` adds the entry to any visible list.
4. The Server Action writes, calls `updateTag(\`user:${uid}:dashboard\`)` and returns `{ ok: true, savedAt }`.
5. The button shows "Saved ✓" for about 2 s, then returns to idle. Errors render inline and get announced.

**Constraint:** This needs a small client component for the form. That's fine: the zero-JS goal applies to the dashboard, and forms are inherently interactive. Without JavaScript, the `<form action>` still submits (progressive enhancement).

### 3.2 Skeletons vs spinners vs progress bars: duration thresholds

- **Nielsen's limits:** 0.1 s feels instant, so no special feedback is needed. 1 s keeps the user's flow of thought. 10 s is the limit for holding attention.
- **NN/g guidance:**
  - **< 1 s:** show no skeleton or spinner. "Using a skeleton screen in such situations can be annoying because the quick flashing page can cause users to feel like they can't keep up."
  - **2–10 s:** looped indicators. NN/g's "Skeleton Screens 101" says spinners "are best used when the page takes 2–10 seconds to load. Similarly, skeleton screens should be used with a wait time that's under 10 seconds."
  - **≥ 10 s:** a percent-done indicator plus a way to cancel.
  - Skeletons suit waits under 10 s and work best "when the full screen is loading". **Don't use "frame-display" skeletons** that show only a header and footer.
- **Implication for this app:** After fixes 1.1–1.5, most cards should resolve well under 1 s, and the skeleton would just flash. Practical tactics:
  - Keep skeletons **low contrast and shaped exactly like the final card**: same height, same chart area, so there's no layout shift.
  - Use a subtle opacity pulse rather than a bright shimmer, and disable it under reduced motion.
  - For button saves, use an inline "Saving…" state rather than a page-level spinner.
- **Disagreement to note:** Some practitioners put the skeleton sweet spot at about 1–4 s. NN/g's range runs up to 10 s. They agree on the lower bound.

### 3.3 Button states: idle → pending → success, accessibly

- **`disabled` vs `aria-disabled`:**
  - Setting `disabled` on the focused button **drops keyboard focus**. Focus falls back to `<body>` and screen-reader users lose their place.
  - GitHub's Primer: for loading buttons, "don't remove them from the DOM or add disabled… Instead, add aria-disabled="true"". Then block repeat submits in code: an early return, or check `pending` in the submit handler.
  - Style it with `button[aria-disabled="true"] { opacity:.6; cursor:not-allowed }`.
  - **Counter-view:** Bekk's 24 December 2023 article "Making an accessible loading button: Aria-disabled with friends" says "in the case of a loading button, it is OK to use disabled, assuming the wait won't be too long", when the label changes to show loading. Prefer `aria-disabled`, which is safer and costs nothing.
- **Announcements:**
  - Use a visually hidden `aria-live="polite"` region. It "must be present on page load, but the message inside the live region should only be rendered while the Button is in a loading state."
  - Render it empty first. Creating the region and its message in the same frame means "most screen readers announce nothing."
  - Use `role="alert"` (assertive) for errors.
  - Optionally set `aria-busy="true"` on the button or form while pending.
- **Avoid double announcements:** If the visible label changes ("Save" → "Saving…") *and* a live region announces it, users hear it twice. One reference implementation keeps the label stable for assistive technology, treats the spinner and check icons as visual-only (`aria-hidden`), and relies only on the live region.
- **Success state:** Show "Saved ✓" plus a polite announcement ("Run saved"), then return to idle after about 2 s. Keep focus on the button. Keep the width fixed (`min-width`) so the label change doesn't shift layout.

### 3.4 Perceived-performance techniques, ranked for this app

1. **A static shell from the CDN** (Cache Components prerender): the header and card frames paint instantly.
2. **Granular streaming:** each card's `<Suspense>` resolves on its own, fast cards first.
3. **Optimistic UI** on logging: the new entry or heatmap cell appears immediately.
4. **Layout-matched skeletons** only where waits exceed about 1 s.
5. **Instant button feedback** (<100 ms) through `useFormStatus`.

### 3.5 `prefers-reduced-motion`

- Default to no motion and add motion inside `@media (prefers-reduced-motion: no-preference)`. Or override with `reduce`, setting `animation: none` and **forcing the final visual state**: `stroke-dashoffset: 0`, `opacity: 1`, `transform: none`. Otherwise reduced-motion users see half-drawn charts.
- Apply the same rule to skeleton pulses, ring fills, number count-ups and "Saved ✓" pops. Tailwind v4 provides `motion-safe:` and `motion-reduce:` variants for this.

---

## Recommendations: implementation order

1. **Today (infrastructure, about 1 hour):**
   - Set the function region to `bom1` and redeploy.
   - Migrate Supabase to asymmetric JWT signing keys.
   - Swap every server `getUser()` for a `React.cache()`-wrapped `getClaims()`, and remove network auth calls from `proxy.ts`.
   - Measure before and after with `performance.now()` logs on a production deployment.
2. **This week (data layer):**
   - Run all Panel queries in one `Promise.all`, or better, one `get_dashboard` RPC doing aggregation in SQL.
   - Add `(user_id, date)` indexes.
   - Restrict the date range and select only the columns you need.
3. **Next (rendering):**
   - Turn on `cacheComponents`.
   - Make each card an async Server Component in its own `<Suspense>` with a layout-matched skeleton.
   - Cache the dashboard aggregates with `'use cache'` keyed by `userId` with `cacheTag`, and call `updateTag` in every Server Action.
   - Don't rely on `'use cache: private'` yet.
4. **Design pass:**
   - Add the WHOOP-style verdict strip (3 headline metrics, each with status colour and sentence).
   - Swap the week-vs-week tiles for bullet charts, sleep for floating range bars, and add a weight projection.
   - Give the heatmap separate treatments for "not logged", "rest", "blocked" and "trained".
   - Move to the Tailwind 400-level / Okabe-Ito palette on `#121212`/`#1E1E1E`, with every data mark ≥3:1 against the card and strokes ≥2px.
5. **Polish:**
   - Add one-shot CSS entrance animations (transform/opacity) gated by reduced motion.
   - Build an accessible SubmitButton (`aria-disabled`, a pre-mounted polite live region, a "Saved ✓" state).
   - Consolidate to one variable font family with `subsets: ['latin']`.

## Caveats

- The roughly 800 → 100 ms region figure comes from Parveen Kumar's single developer write-up using MongoDB, not Supabase. Treat it as an order of magnitude and measure your own.
- The `getClaims()` timings come from the sumeet-spec/Sendkar project's PRs #4 and #5, not a controlled benchmark.
- The Next 16 Cache Components APIs are new and still changing between minor versions. `'use cache: private'` is explicitly experimental, and per-user caching outside it means bypassing RLS with a server-only client, which is a security decision you must own.
- The "10–30 s wake from pause" claim is unverified and conflicts with sources saying paused projects need manual restoring.
- The free-tier compute spec is quoted slightly differently in Supabase's own pages (pricing: "Shared CPU • 500 MB RAM"; Compute and Disk docs: Nano "Shared", "Up to 0.5 GB" memory).
- Dark-mode desaturation percentages vary between guides (10–30%). Treat them as starting points and verify with a contrast checker.
- The Okabe-Ito contrast ratios were calculated, not published. Only part of the Carbon dark palette was confirmed against the source.
- The Bateman "useful junk" result comes from a small study (20 participants) with small datasets. Later work with larger datasets and time limits found more nuanced effects.