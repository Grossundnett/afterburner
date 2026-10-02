import { clockToHours, hoursToClockString } from "@/lib/dates";
import { unwrapClockHours } from "@/lib/chart";
import { Verdict, statusColor, type Status } from "./verdict";

const BAR_W = 220;
const BAR_H = 10;
const VIEW_H = BAR_H + 4; // headroom so the last-week tick can overshoot the bar

type DayRow = {
  date: string;
  wake_time: string | null;
  sleep_time: string | null;
};

type ActivityRow = {
  date: string;
  sport: string;
  distance_m: number | null;
  duration_s: number | null;
};

function avgWake(days: DayRow[]): number | null {
  const times = days.flatMap((d) =>
    d.wake_time ? [clockToHours(d.wake_time)] : [],
  );
  if (times.length === 0) return null;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

/** Average sleep duration in hours. Uses unwrapClockHours on sleep so 02:00
 *  sorts after 23:30 rather than before it. */
function avgSleepDuration(days: DayRow[]): number | null {
  const durations = days.flatMap((d) => {
    if (!d.wake_time || !d.sleep_time) return [];
    const wake = clockToHours(d.wake_time);
    const sleep = unwrapClockHours(d.sleep_time);
    const dur = sleep >= 24 ? wake + 24 - sleep : wake + 24 - sleep;
    return dur > 0 && dur < 24 ? [dur] : [];
  });
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

function sumKm(activities: ActivityRow[]): number {
  return activities
    .filter((a) => a.sport === "run" && a.distance_m !== null)
    .reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000;
}

function countSessions(activities: ActivityRow[]): number {
  return new Set(activities.map((a) => a.date)).size;
}

type Row = {
  label: string;
  thisRaw: number | null;
  lastRaw: number | null;
  thisLabel: string;
  lastLabel: string;
  status: Status;
  higherIsBetter: boolean;
};

function row(
  label: string,
  thisRaw: number | null,
  lastRaw: number | null,
  format: (v: number) => string,
  higherIsBetter: boolean,
): Row {
  const thisLabel = thisRaw !== null ? format(thisRaw) : "—";
  const lastLabel = lastRaw !== null ? format(lastRaw) : "—";

  let status: Status = "neutral";
  if (thisRaw !== null && lastRaw !== null) {
    const diff = thisRaw - lastRaw;
    if (Math.abs(diff) >= 0.05) {
      const better = higherIsBetter ? diff > 0 : diff < 0;
      status = better ? "good" : "warn";
    }
  }

  return { label, thisRaw, lastRaw, thisLabel, lastLabel, status, higherIsBetter };
}

/** Horizontal bullet bar: a bar for this week, a tick for last week. */
function BulletBar({ r }: { r: Row }) {
  const scaleMax = Math.max(r.thisRaw ?? 0, r.lastRaw ?? 0, 1) * 1.15;
  const thisW = r.thisRaw !== null ? (r.thisRaw / scaleMax) * BAR_W : 0;
  const tickX = r.lastRaw !== null ? (r.lastRaw / scaleMax) * BAR_W : null;

  return (
    <div className="flex items-center gap-3">
      <span className="w-[62px] shrink-0 text-[12px] text-text-muted">
        {r.label}
      </span>
      <svg
        viewBox={`0 0 ${BAR_W} ${VIEW_H}`}
        className="flex-1"
        role="img"
        aria-label={`${r.label}: ${r.thisLabel} this week, ${r.lastLabel} last week`}
        preserveAspectRatio="none"
      >
        <rect
          x={0}
          y={2}
          width={BAR_W}
          height={BAR_H}
          rx={2}
          fill="var(--surface-2)"
        />
        <rect
          x={0}
          y={2}
          width={Math.max(thisW, 2)}
          height={BAR_H}
          rx={2}
          fill={statusColor(r.status)}
        />
        {tickX !== null && (
          <line
            x1={tickX}
            y1={0}
            x2={tickX}
            y2={VIEW_H}
            stroke="var(--text-muted)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <span className="w-[52px] shrink-0 text-right font-mono text-[13px] tabular-nums text-text">
        {r.thisLabel}
      </span>
    </div>
  );
}

export function WeekComparison({
  thisDays,
  lastDays,
  thisActivities,
  lastActivities,
}: {
  thisDays: DayRow[];
  lastDays: DayRow[];
  thisActivities: ActivityRow[];
  lastActivities: ActivityRow[];
}) {
  const sessions = row(
    "Sessions",
    countSessions(thisActivities),
    countSessions(lastActivities),
    (v) => String(Math.round(v)),
    true,
  );

  const rows: Row[] = [
    sessions,
    row("Km run", sumKm(thisActivities), sumKm(lastActivities), (v) => v.toFixed(1), true),
    row(
      "Avg wake",
      avgWake(thisDays),
      avgWake(lastDays),
      (v) => hoursToClockString(v),
      false, // earlier is better
    ),
    row(
      "Sleep",
      avgSleepDuration(thisDays),
      avgSleepDuration(lastDays),
      (v) => `${v.toFixed(1)}h`,
      true, // more sleep is better
    ),
  ];

  const sentence =
    sessions.status === "neutral"
      ? sessions.lastRaw === null
        ? "No sessions last week to compare against yet."
        : "Same number of sessions as last week."
      : sessions.status === "good"
        ? `${sessions.thisLabel} sessions this week, up from ${sessions.lastLabel}.`
        : `${sessions.thisLabel} sessions this week, down from ${sessions.lastLabel}.`;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">
        This week vs last
      </p>

      <p className="mt-2 font-mono text-[36px] leading-none tabular-nums text-text">
        {sessions.thisLabel}
        <span className="text-[15px] text-text-muted"> sessions</span>
      </p>

      <Verdict status={sessions.status} sentence={sentence} />

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((r) => (
          <BulletBar key={r.label} r={r} />
        ))}
      </div>

      <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-text-muted">
        <span className="inline-block h-0.5 w-3 bg-text-muted" />
        last week
      </p>
    </section>
  );
}
