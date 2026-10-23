/**
 * Calendar dates, as plain YYYY-MM-DD strings.
 *
 * Everything here deals in calendar dates rather than instants. A training day
 * is a date on a wall calendar, not a moment in time, so nothing below ever
 * involves a local clock — which is also why all the arithmetic is done in UTC.
 * Adding 24 hours to a local Date breaks twice a year in any timezone with
 * daylight saving; adding 24 hours to a UTC timestamp never does.
 */

/** An HTML date input always produces this shape. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | undefined | null): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

/**
 * Today, in the person's own timezone rather than the server's.
 *
 * Vercel runs in UTC. Logging at 01:00 in Asia/Kolkata is still 19:30 the
 * previous day in UTC, so a naive toISOString() would give yesterday exactly
 * when someone is logging late at night — the most likely moment to be using
 * this. en-CA formats as YYYY-MM-DD, which is the shape a date input wants.
 */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    // An unrecognised timezone string would otherwise throw and take the page
    // down. UTC is wrong by a few hours; a blank page is wrong entirely.
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Formats a YYYY-MM-DD string for display.
 *
 * Built from explicit parts and formatted in UTC on purpose. `new Date("2026-09-19")`
 * parses as UTC midnight, so formatting that in a timezone behind UTC renders
 * the previous day — the calendar date would be off by one for exactly the
 * people this app is for.
 *
 *   long  — Saturday 19 September 2026, for a page heading
 *   short — 19 Sep 2026, for a confirmation message
 *   row   — Sat 19 Sep, for a dense list where the year is redundant
 */
export function formatDate(
  iso: string,
  style: "long" | "short" | "row",
): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : style === "row" ? "short" : undefined,
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: style === "row" ? undefined : "numeric",
  }).format(utc);
}

/**
 * The calendar date `delta` days from `iso`. Negative goes backwards.
 *
 * UTC arithmetic for the same reason as everything else here: a day is 86.4
 * million milliseconds only if no clock shifts underneath it, which is exactly
 * what local time does not guarantee.
 */
export function addDays(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + delta * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/**
 * The `count` calendar dates ending on `endDate`, newest first.
 *
 * This is the spine the list view is built from, and it comes from the calendar
 * rather than from query results on purpose. A list assembled out of the rows
 * that came back would silently omit the days nothing was logged on — which are
 * precisely the days worth seeing.
 */
export function lastNDates(endDate: string, count: number): string[] {
  const [year, month, day] = endDate.split("-").map(Number);
  const end = Date.UTC(year, month - 1, day);
  const dayMs = 86_400_000;

  return Array.from({ length: count }, (_, index) =>
    new Date(end - index * dayMs).toISOString().slice(0, 10),
  );
}

/**
 * The Monday of the ISO week containing `iso`. ISO weeks start on Monday.
 * Used for "this week vs last week" comparisons.
 */
export function weekStart(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(utc.getTime() - daysToMon * 86_400_000);
  return mon.toISOString().slice(0, 10);
}

/**
 * The YYYY-MM plan this date's payday cycle is governed by. Payday is the
 * last calendar day of the month; the cycle runs from a payday to the day
 * before the next one. Every day in a cycle falls in the calendar month
 * right after cycle_start — except cycle_start itself, which IS a month's
 * last day and so reads as that month unless corrected here. Must match
 * get_dashboard()'s SQL exactly, or the plan page and the RPC disagree about
 * which month's budget governs today.
 */
export function cycleMonth(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const lastOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === lastOfMonth) {
    const next = new Date(Date.UTC(year, month, 1));
    return next.toISOString().slice(0, 7);
  }
  return iso.slice(0, 7);
}

/**
 * The payday cycle a plan row's `month` (YYYY-MM) governs, as ISO date
 * bounds. Inverse of `cycleMonth`: `cycle_start` is the last calendar day
 * of the PRIOR month (payday), `cycle_end` the last calendar day of `month`
 * itself minus one (the day before the next payday). Must match
 * `get_dashboard()`'s SQL exactly — same derivation, just run backwards from
 * the plan row's month instead of forwards from today's date.
 */
/**
 * Mom's rule's total day-weight mass for a cycle: 0.8/day for cycle-day
 * 1-14, 1.2/day from day 15 on. This is NOT the same as `len / 7` (plain
 * calendar weeks) — it's the same v_total `_spend_week_allowance` divides by
 * in SQL, and every weekly category's own budget bar is scaled by a week's
 * share of this mass (`_spend_weekly_rate_budget`). A cycle total for a
 * weekly-rate category must use this same mass, or "Unassigned" would not
 * equal cap minus what the weekly bars actually add up to over the cycle.
 */
export function cycleWeightTotal(start: string, end: string): number {
  const len = daysBetween(start, end) + 1;
  const first = Math.min(len, 14);
  const rest = Math.max(len - 14, 0);
  return first * 0.8 + rest * 1.2;
}

export function cycleBoundsForMonth(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 0)); // day 0 of `mon` = last day of mon-1
  const end = new Date(Date.UTC(year, mon, 0) - 86_400_000); // last day of `mon`, minus 1 day
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/** Hours and fractional minutes from a HH:MM or HH:MM:SS string. */
export function clockToHours(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

/** Formats decimal hours as HH:MM. */
export function hoursToClockString(h: number): string {
  const wrapped = ((h % 24) + 24) % 24;
  const hh = Math.floor(wrapped);
  const mm = Math.round((wrapped - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
