import {
  areaPath,
  buildScale,
  linePath,
  movingAverage,
  splitOnGaps,
  type SeriesPoint,
} from "@/lib/chart";
import { addDays, daysBetween, formatDate } from "@/lib/dates";
import { Verdict, statusColor, type Status } from "./verdict";

const WIDTH = 320;
const HEIGHT = 120;
const MAX_GAP_DAYS = 7;
const GOAL_KG = 60;
/** Need at least this many days of trend to trust a projected rate. */
const MIN_TREND_DAYS = 14;

export function WeightTrend({
  points,
  today,
}: {
  points: readonly SeriesPoint[];
  today: string;
}) {
  const scale = buildScale(points, WIDTH, HEIGHT, { endDate: today });

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

  const ma = movingAverage(points, 7);
  const maSegments = splitOnGaps(ma, MAX_GAP_DAYS);
  const rawSegments = splitOnGaps(points, MAX_GAP_DAYS);

  // Trend rate from the moving average over its trailing MIN_TREND_DAYS,
  // so one noisy weigh-in can't swing the projection — only the sustained
  // direction can.
  const windowStart = addDays(latest.date, -(MIN_TREND_DAYS - 1));
  const trendPoints = ma.filter((p) => p.date >= windowStart);
  const trendFirst = trendPoints[0];
  const trendSpanDays = daysBetween(trendFirst?.date ?? latest.date, latest.date);
  const rate =
    trendFirst && trendSpanDays > 0
      ? (latest.value - trendFirst.value) / trendSpanDays
      : 0;

  const distanceToGoal = GOAL_KG - latest.value;
  const atGoal = Math.abs(distanceToGoal) < 0.2;
  const movingToward = distanceToGoal === 0 || Math.sign(rate) === Math.sign(distanceToGoal);
  const daysToGoal =
    !atGoal && movingToward && rate !== 0 ? distanceToGoal / rate : null;

  const CAP_PROJECTION_DAYS = 180;
  const canProject =
    daysToGoal !== null && daysToGoal > 0 && daysToGoal <= CAP_PROJECTION_DAYS;
  const projectedDate = canProject ? addDays(latest.date, Math.round(daysToGoal!)) : null;

  const enoughTrendData = trendSpanDays >= MIN_TREND_DAYS;

  const status: Status = atGoal
    ? "good"
    : !enoughTrendData
      ? "neutral"
      : canProject
        ? "good"
        : movingToward
          ? "warn"
          : "bad";
  const sentence = atGoal
    ? `At your ${GOAL_KG}kg goal.`
    : !enoughTrendData
      ? "Not enough recent data to project a trend."
      : canProject
        ? `At this rate: ${GOAL_KG}kg by ${formatDate(projectedDate!, "row")}.`
        : movingToward
          ? `Trending toward ${GOAL_KG}kg, but too slowly to project a date yet.`
          : `Trending away from your ${GOAL_KG}kg goal.`;

  // Chart's x/y domain must cover the projection point too, or the dashed
  // line and goal marker would be drawn off the edge of the viewBox.
  const chartEndDate = projectedDate && projectedDate > today ? projectedDate : today;
  const scaleWithGoal = buildScale(
    [...points, { date: chartEndDate, value: GOAL_KG }],
    WIDTH,
    HEIGHT,
    { endDate: chartEndDate },
  )!;
  const goalY = scaleWithGoal.y(GOAL_KG);

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

      <Verdict status={status} sentence={sentence} />

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 w-full"
        role="img"
        aria-label={`Weight from ${earliest.value.toFixed(1)} to ${latest.value.toFixed(1)} kg${canProject ? `, projected to reach the ${GOAL_KG}kg goal by ${formatDate(projectedDate!, "row")}` : ""}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="wgt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Goal line — dashed, signal amber */}
        <line
          x1={0}
          y1={goalY}
          x2={WIDTH}
          y2={goalY}
          stroke="var(--signal)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={WIDTH - 2}
          y={goalY - 3}
          fill="var(--signal)"
          fontSize="10"
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          goal
        </text>

        {/* Gradient fill under MA — drawn before the lines so lines sit on top */}
        {maSegments.map((seg, i) => (
          <path key={i} d={areaPath(seg, scaleWithGoal)} fill="url(#wgt-fill)" />
        ))}

        {/* Raw points at 40% — the MA is the signal, raw is context */}
        {rawSegments.map((seg, i) => (
          <path
            key={i}
            d={linePath(seg, scaleWithGoal)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* 7-day moving average — the main line */}
        {maSegments.map((seg, i) => (
          <path
            key={i}
            d={linePath(seg, scaleWithGoal)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Dashed projection from the latest trend point to the goal */}
        {canProject && (
          <line
            x1={scaleWithGoal.x(latest.date)}
            y1={scaleWithGoal.y(latest.value)}
            x2={scaleWithGoal.x(projectedDate!)}
            y2={goalY}
            stroke={statusColor(status)}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Data points: surface ring behind accent dot so they read against the line */}
        {points.map((p) => (
          <g key={p.date}>
            <circle
              cx={scaleWithGoal.x(p.date)}
              cy={scaleWithGoal.y(p.value)}
              r="3.5"
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {formatDate(p.date, "short")}: {p.value.toFixed(1)} kg
              </title>
            </circle>
          </g>
        ))}
      </svg>

      <div className="mt-2 flex justify-between font-mono text-[12px] tabular-nums text-text-muted">
        <span>{scale.min.toFixed(1)} low</span>
        <span>{scale.max.toFixed(1)} high</span>
      </div>

      <p className="mt-1 font-mono text-[11px] tracking-[0.02em] text-text-muted">
        {formatDate(scale.first, "row")} — {formatDate(today, "row")}
      </p>
    </section>
  );
}
