import {
  areaPath,
  buildScale,
  linePath,
  movingAverage,
  splitOnGaps,
  type SeriesPoint,
} from "@/lib/chart";
import { formatDate } from "@/lib/dates";

const WIDTH = 320;
const HEIGHT = 120;
const MAX_GAP_DAYS = 7;
const GOAL_KG = 60;

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
  const falling = change < -0.05;

  const ma = movingAverage(points, 7);
  const maSegments = splitOnGaps(ma, MAX_GAP_DAYS);
  const rawSegments = splitOnGaps(points, MAX_GAP_DAYS);

  const goalY = scale.y(GOAL_KG);
  const showGoal = GOAL_KG >= scale.min && GOAL_KG <= scale.max + (scale.max - scale.min) * 0.2;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">Weight</p>

      <p className="mt-2 font-mono text-[36px] leading-none tabular-nums text-text">
        {latest.value.toFixed(1)}
        <span className="text-[15px] text-text-muted"> kg</span>
      </p>

      <p
        className={`mt-1 font-mono text-[13px] tabular-nums ${falling ? "text-accent" : "text-text-muted"}`}
      >
        {change === 0
          ? "no change"
          : `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} kg`}{" "}
        since {formatDate(earliest.date, "row")}
      </p>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 w-full"
        role="img"
        aria-label={`Weight from ${earliest.value.toFixed(1)} to ${latest.value.toFixed(1)} kg`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="wgt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Goal line — dashed, signal amber */}
        {showGoal && (
          <>
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
          </>
        )}

        {/* Gradient fill under MA — drawn before the lines so lines sit on top */}
        {maSegments.map((seg, i) => (
          <path
            key={i}
            d={areaPath(seg, scale)}
            fill="url(#wgt-fill)"
          />
        ))}

        {/* Raw points at 40% — the MA is the signal, raw is context */}
        {rawSegments.map((seg, i) => (
          <path
            key={i}
            d={linePath(seg, scale)}
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
            d={linePath(seg, scale)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Data points: surface ring behind accent dot so they read against the line */}
        {points.map((p) => (
          <g key={p.date}>
            <circle
              cx={scale.x(p.date)}
              cy={scale.y(p.value)}
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
    </section>
  );
}
