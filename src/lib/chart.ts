import { daysBetween } from "@/lib/dates";

/**
 * Chart maths for hand-rolled inline SVG.
 *
 * There is no charting library here on purpose — see the Stack note in
 * AGENTS.md. Everything the four planned charts need is min/max, a linear
 * scale and a path string, which is less code than configuring a library to
 * match the design tokens, and it keeps the charts Server Components that ship
 * no JavaScript.
 */

export type SeriesPoint = { date: string; value: number };

export type Scale = {
  /** Calendar date to horizontal position. */
  x: (date: string) => number;
  /** Value to vertical position. SVG y grows downward, so this inverts. */
  y: (value: number) => number;
  width: number;
  height: number;
  first: string;
  last: string;
  min: number;
  max: number;
};

/**
 * Builds the scales for one series, or null when there is nothing to draw.
 *
 * Two decisions worth knowing:
 *
 * The horizontal axis is scaled by DATE, never by array index. Evenly spacing
 * points by position makes a three-week gap look identical to three
 * consecutive days, which is the difference between a chart and a lie.
 *
 * The vertical axis spans the data, not zero. For weight or a clock time, a
 * zero baseline flattens the entire signal into a straight line near the top —
 * these charts are about change, not magnitude. A little padding keeps the
 * extremes off the edges so their labels have somewhere to sit.
 */
export function buildScale(
  points: readonly SeriesPoint[],
  width: number,
  height: number,
  padding = 0.12,
): Scale | null {
  if (points.length === 0) return null;

  const first = points[0].date;
  const last = points[points.length - 1].date;
  const span = Math.max(daysBetween(first, last), 1);

  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  // A single reading, or a flat run, has no range to scale against. Give it an
  // arbitrary one so the point lands mid-chart instead of dividing by zero.
  const spread = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.02, 1);
  const min = rawMin - spread * padding;
  const max = rawMax + spread * padding;

  return {
    x: (date) => (daysBetween(first, date) / span) * width,
    y: (value) => height - ((value - min) / (max - min)) * height,
    width,
    height,
    first,
    last,
    min: rawMin,
    max: rawMax,
  };
}

/**
 * Splits a series wherever consecutive readings are further apart than
 * `maxGapDays`, so the line is drawn in pieces rather than across the gap.
 *
 * A line segment claims the values between its ends were measured. Across a
 * fortnight of not weighing yourself that claim is false, and the resulting
 * smooth diagonal reads as a trend that never happened. Breaking the path says
 * "no data here", which is the truth.
 *
 * Points are assumed to be in date order.
 */
export function splitOnGaps(
  points: readonly SeriesPoint[],
  maxGapDays: number,
): SeriesPoint[][] {
  const segments: SeriesPoint[][] = [];
  let current: SeriesPoint[] = [];

  for (const point of points) {
    const previous = current[current.length - 1];

    if (previous && daysBetween(previous.date, point.date) > maxGapDays) {
      segments.push(current);
      current = [];
    }

    current.push(point);
  }

  if (current.length > 0) segments.push(current);

  return segments;
}

/** An SVG path for one unbroken run of points. */
export function linePath(
  points: readonly SeriesPoint[],
  scale: Scale,
): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${scale.x(point.date).toFixed(2)} ${scale
          .y(point.value)
          .toFixed(2)}`,
    )
    .join(" ");
}

/**
 * A clock time as hours past midnight, unwrapped so late nights sort after
 * early evenings rather than before them.
 *
 * THIS WILL LOOK LIKE A BUG. It is not. Going to bed at 02:00 is later than
 * going to bed at 23:30, but as plain clock numbers 2 is smaller than 23. Plot
 * them raw and a normal late week zigzags violently between the top and bottom
 * of the axis, because the axis thinks 02:00 is twenty-one and a half hours
 * before 23:30 rather than two and a half hours after it.
 *
 * So anything before `wrapBefore` is treated as belonging to the previous
 * evening and gets 24 added: 02:00 becomes 26:00. Twelve noon is the default
 * split, which is safe for sleep times — nobody logs going to bed at 13:00, and
 * a 03:00 bedtime stays correctly after a 23:00 one.
 *
 * Wake times must NOT be passed through this. They genuinely belong in the
 * morning, and unwrapping a 06:30 wake into 30:30 would be nonsense.
 */
export function unwrapClockHours(clock: string, wrapBefore = 12): number {
  const [hours, minutes] = clock.split(":").map(Number);
  const asHours = hours + minutes / 60;

  return asHours < wrapBefore ? asHours + 24 : asHours;
}
