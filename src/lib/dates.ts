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
