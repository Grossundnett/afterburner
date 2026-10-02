import {
  buildScale,
  linePath,
  splitOnGaps,
  type SeriesPoint,
} from "@/lib/chart";
import { addDays, formatDate } from "@/lib/dates";
import { Verdict, type Status } from "./verdict";

const WIDTH = 320;
const LINE_H = 100;
const BAR_H = 40;
const MAX_GAP_DAYS = 7;
/** Compare the last 4 weeks of pace against the 4 weeks before that. */
const BASELINE_WINDOW_DAYS = 28;

type ActivityRow = {
  date: string;
  sport: string;
  distance_m: number | null;
  avg_pace_s_per_km: number | null;
};

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RunningChart({ activities, today }: { activities: readonly ActivityRow[]; today: string }) {
  const runs = activities.filter((a) => a.sport === "run");

  if (runs.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-[13px] tracking-[0.02em] text-text-muted">Running</p>
        <p className="mt-2 text-[13px] text-text-muted">
          No runs in the last 90 days.
        </p>
      </section>
    );
  }

  const pacePoints: SeriesPoint[] = runs.flatMap((a) =>
    a.avg_pace_s_per_km !== null
      ? [{ date: a.date, value: a.avg_pace_s_per_km }]
      : [],
  );

  const distPoints: SeriesPoint[] = runs.flatMap((a) =>
    a.distance_m !== null
      ? [{ date: a.date, value: a.distance_m / 1000 }]
      : [],
  );

  // Best 5K: find the run with a distance ≥5000m and the lowest pace.
  const candidatesFor5K = runs.filter(
    (a) => a.distance_m !== null && a.distance_m >= 5000 && a.avg_pace_s_per_km !== null,
  );
  const best5K =
    candidatesFor5K.length > 0
      ? candidatesFor5K.reduce((best, a) =>
          (a.avg_pace_s_per_km ?? Infinity) < (best.avg_pace_s_per_km ?? Infinity)
            ? a
            : best,
        )
      : null;

  // Own-baseline comparison: last 4 weeks of pace vs the 4 weeks before.
  const recentStart = addDays(today, -(BASELINE_WINDOW_DAYS - 1));
  const priorStart = addDays(today, -(BASELINE_WINDOW_DAYS * 2 - 1));
  const avgPace = (pts: SeriesPoint[]) =>
    pts.length > 0 ? pts.reduce((s, p) => s + p.value, 0) / pts.length : null;
  const recentAvg = avgPace(pacePoints.filter((p) => p.date >= recentStart));
  const priorAvg = avgPace(
    pacePoints.filter((p) => p.date >= priorStart && p.date < recentStart),
  );

  let status: Status = "neutral";
  let sentence = "Not enough recent runs to compare a pace trend.";
  if (recentAvg !== null && priorAvg !== null) {
    const diff = recentAvg - priorAvg; // negative = faster
    if (Math.abs(diff) < 2) {
      sentence = `Pace steady at ${fmtPace(recentAvg)}/km over the last 4 weeks.`;
    } else if (diff < 0) {
      status = "good";
      sentence = `${fmtPace(recentAvg)}/km over the last 4 weeks, ${Math.round(-diff)}s/km faster than the 4 before.`;
    } else {
      status = "warn";
      sentence = `${fmtPace(recentAvg)}/km over the last 4 weeks, ${Math.round(diff)}s/km slower than the 4 before.`;
    }
  }

  const paceScale = buildScale(pacePoints, WIDTH, LINE_H, {
    endDate: today,
    invertY: true, // lower pace = faster = should be higher on screen
  });

  const distScale = buildScale(distPoints, WIDTH, BAR_H, { endDate: today });

  const paceSegments = paceScale ? splitOnGaps(pacePoints, MAX_GAP_DAYS) : [];

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">Running</p>

      {best5K && (
        <div className="mt-2">
          <p className="font-mono text-[36px] leading-none tabular-nums text-text">
            {fmtPace(best5K.avg_pace_s_per_km!)}
            <span className="text-[15px] text-text-muted"> /km</span>
          </p>
          <p className="mt-1 font-mono text-[13px] tabular-nums text-text-muted">
            best 5K pace · {formatDate(best5K.date, "row")}
          </p>
        </div>
      )}

      <Verdict status={status} sentence={sentence} />

      {/* Pace chart — inverted y so improvement shows as line going up */}
      {paceScale && pacePoints.length > 0 && (
        <>
          <p className="mt-4 text-[11px] tabular-nums text-text-muted">
            pace (faster ↑)
          </p>
          <svg
            viewBox={`0 0 ${WIDTH} ${LINE_H}`}
            className="mt-1 w-full"
            role="img"
            aria-label="Running pace over 90 days, lower is faster"
            preserveAspectRatio="none"
          >
            {paceSegments.map((seg, i) => (
              <path
                key={i}
                d={linePath(seg, paceScale)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {pacePoints.map((p) => (
              <circle
                key={p.date}
                cx={paceScale.x(p.date)}
                cy={paceScale.y(p.value)}
                r="3.5"
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {formatDate(p.date, "short")}: {fmtPace(p.value)} /km
                </title>
              </circle>
            ))}
          </svg>
        </>
      )}

      {/* Distance bars */}
      {distScale && distPoints.length > 0 && (
        <>
          <p className="mt-3 text-[11px] tabular-nums text-text-muted">
            distance (km)
          </p>
          <svg
            viewBox={`0 0 ${WIDTH} ${BAR_H}`}
            className="mt-1 w-full"
            role="img"
            aria-label="Distance per run"
            preserveAspectRatio="none"
          >
            {distPoints.map(({ date, value }) => {
              const barH = distScale.y(0) - distScale.y(value);
              const barY = distScale.y(value);
              return (
                <rect
                  key={date}
                  x={distScale.x(date) - 4}
                  y={barY}
                  width={8}
                  height={Math.max(barH, 2)}
                  rx={2}
                  fill="var(--accent)"
                  fillOpacity="0.6"
                >
                  <title>
                    {formatDate(date, "short")}: {value.toFixed(1)} km
                  </title>
                </rect>
              );
            })}
          </svg>
        </>
      )}
    </section>
  );
}
