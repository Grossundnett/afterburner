import { daysBetween } from "@/lib/dates";

/**
 * Chart maths for hand-rolled inline SVG.
 *
 * There is no charting library here on purpose — see the Stack note in
 * AGENTS.md. Everything the planned charts need is min/max, a linear scale
 * and a path string, which is less code than configuring a library to match
 * the design tokens, and it keeps the charts Server Components that ship no
 * JavaScript.
 */

export type SeriesPoint = { date: string; value: number };

export type Scale = {
  /** Calendar date to horizontal position. */
  x: (date: string) => number;
  /** Value to vertical position. SVG y grows downward; higher values are higher unless invertY was set. */
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
 * endDate: the right edge of the x axis. Defaults to the last data point.
 * Pass today so the axis spans first-data-point → today, not just the range
 * of readings. Without this the chart is mostly empty when data starts late
 * in the window — the "90-day axis with September data" bug.
 *
 * invertY: flips the vertical axis so smaller values are higher on screen.
 * Use for pace charts where lower is faster, so an improvement goes UP.
 *
 * The vertical axis spans the data, not zero. A zero baseline flattens a
 * weight series into a straight line near the top — these charts are about
 * change, not magnitude.
 */
export function buildScale(
  points: readonly SeriesPoint[],
  width: number,
  height: number,
  {
    padding = 0.12,
    endDate,
    invertY = false,
  }: { padding?: number; endDate?: string; invertY?: boolean } = {},
): Scale | null {
  if (points.length === 0) return null;

  const first = points[0].date;
  const last = endDate ?? points[points.length - 1].date;
  const span = Math.max(daysBetween(first, last), 1);

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  const spread = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.02, 1);
  const min = rawMin - spread * padding;
  const max = rawMax + spread * padding;

  const yNormal = (value: number) =>
    height - ((value - min) / (max - min)) * height;
  const yInverted = (value: number) =>
    ((value - min) / (max - min)) * height;

  return {
    x: (date) => (daysBetween(first, date) / span) * width,
    y: invertY ? yInverted : yNormal,
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
 * maxGapDays, so the line is drawn in pieces rather than across the gap.
 *
 * A line segment claims the values between its ends were measured. Across a
 * fortnight of not weighing yourself that claim is false, and the resulting
 * smooth diagonal reads as a trend that never happened. Breaking the path
 * says "no data here", which is the truth.
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

/** An SVG path for one unbroken run of points (line only). */
export function linePath(
  points: readonly SeriesPoint[],
  scale: Scale,
): string {
  return points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${scale.x(p.date).toFixed(2)} ${scale.y(p.value).toFixed(2)}`,
    )
    .join(" ");
}

/** An SVG path that closes the line to the bottom — use with a gradient fill. */
export function areaPath(
  points: readonly SeriesPoint[],
  scale: Scale,
): string {
  if (points.length === 0) return "";
  const line = linePath(points, scale);
  const x0 = scale.x(points[0].date).toFixed(2);
  const xN = scale.x(points[points.length - 1].date).toFixed(2);
  return `${line} L ${xN},${scale.height} L ${x0},${scale.height} Z`;
}

/**
 * 7-day trailing moving average over sparse data.
 *
 * For each point, averages all readings within the preceding `windowDays`
 * calendar days (inclusive). Sparse gaps don't break it — a point that has
 * no neighbours simply returns its own value. The result has the same dates
 * as the input, so it can be scaled with the same Scale.
 */
export function movingAverage(
  points: readonly SeriesPoint[],
  windowDays: number,
): SeriesPoint[] {
  return points.map((point, i) => {
    let sum = 0;
    let count = 0;
    // Walk backwards; stop once we exceed the window.
    for (let j = i; j >= 0; j--) {
      if (daysBetween(points[j].date, point.date) >= windowDays) break;
      sum += points[j].value;
      count++;
    }
    return { date: point.date, value: count > 0 ? sum / count : point.value };
  });
}

/**
 * A clock time as hours past midnight, unwrapped so late nights sort after
 * early evenings rather than before them.
 *
 * THIS WILL LOOK LIKE A BUG. It is not. Going to bed at 02:00 is later than
 * going to bed at 23:30, but as plain clock numbers 2 is smaller than 23.
 * Plot them raw and a normal late week zigzags violently — the axis thinks
 * 02:00 is twenty-one hours before 23:30 rather than two and a half after.
 *
 * So anything before `wrapBefore` gets 24 added: 02:00 becomes 26:00.
 * Twelve noon is the default split — nobody logs going to bed at 13:00.
 *
 * Wake times must NOT be passed through this.
 */
export function unwrapClockHours(clock: string, wrapBefore = 12): number {
  const [hours, minutes] = clock.split(":").map(Number);
  const asHours = hours + (minutes ?? 0) / 60;
  return asHours < wrapBefore ? asHours + 24 : asHours;
}
