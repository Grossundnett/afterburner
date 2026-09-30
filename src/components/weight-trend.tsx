import {
  buildScale,
  linePath,
  splitOnGaps,
  type SeriesPoint,
} from "@/lib/chart";
import { formatDate } from "@/lib/dates";

/** Room for the value labels that sit where an axis gutter would otherwise go. */
const WIDTH = 320;
const HEIGHT = 120;

/** A week without weighing is a break in the record, not a trend across it. */
const MAX_GAP_DAYS = 7;

/**
 * Weight over time, as a §16 card: muted label, the current reading large in
 * mono, the shape beneath it.
 *
 * The big number does the reading and the line does the shape. That split is
 * what lets the chart drop its axes — on 348px of phone there is no room for a
 * y-axis gutter, so the numbers that matter are labelled at their points and
 * everything else is left to the eye.
 */
export function WeightTrend({ points }: { points: readonly SeriesPoint[] }) {
  const scale = buildScale(points, WIDTH, HEIGHT);

  if (!scale) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-[13px] tracking-[0.02em] text-text-muted">Weight</p>
        <p className="mt-2 text-[13px] text-text-muted">
          No weight logged in the last 90 days.
        </p>
      </section>
    );
  }

  const latest = points[points.length - 1];
  const earliest = points[0];
  const change = latest.value - earliest.value;

  const segments = splitOnGaps(points, MAX_GAP_DAYS);

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">Weight</p>

      <p className="mt-2 font-mono text-[36px] leading-none tabular-nums text-text">
        {latest.value.toFixed(1)}
        <span className="text-[15px] text-text-muted"> kg</span>
      </p>

      <p className="mt-1 font-mono text-[13px] tabular-nums text-text-muted">
        {change === 0
          ? "no change"
          : `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} kg`}{" "}
        since {formatDate(earliest.date, "row")}
      </p>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 w-full"
        role="img"
        aria-label={`Weight from ${earliest.value.toFixed(1)} to ${latest.value.toFixed(1)} kilograms between ${formatDate(earliest.date, "short")} and ${formatDate(latest.date, "short")}`}
        preserveAspectRatio="none"
      >
        {/* Drawn per segment. A gap longer than a week gets no connecting line,
            because a segment claims the values between its ends were measured. */}
        {segments.map((segment, index) => (
          <path
            key={index}
            d={linePath(segment, scale)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Every reading is a dot, not just the line. A sparse stretch then
            reads as measurements rather than disappearing into broken path. */}
        {points.map((point) => (
          <circle
            key={point.date}
            cx={scale.x(point.date)}
            cy={scale.y(point.value)}
            r="2.5"
            fill="var(--accent)"
          >
            <title>
              {formatDate(point.date, "short")}: {point.value.toFixed(1)} kg
            </title>
          </circle>
        ))}
      </svg>

      <div className="mt-2 flex justify-between font-mono text-[12px] tabular-nums text-text-muted">
        <span>{scale.min.toFixed(1)} low</span>
        <span>{scale.max.toFixed(1)} high</span>
      </div>
    </section>
  );
}
