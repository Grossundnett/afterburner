import { clockToHours, hoursToClockString } from "@/lib/dates";
import { unwrapClockHours } from "@/lib/chart";

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
    // sleep > 24 means past midnight, so: duration = wake + 24 - sleep
    // sleep < wake means same-night edge case; treat as overnight
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

type Tile = {
  label: string;
  thisVal: string;
  lastVal: string;
  delta: string;
  better: boolean;
  neutral: boolean;
};

function tile(
  label: string,
  thisRaw: number | null,
  lastRaw: number | null,
  format: (v: number) => string,
  higherIsBetter: boolean,
): Tile {
  const thisVal = thisRaw !== null ? format(thisRaw) : "—";
  const lastVal = lastRaw !== null ? format(lastRaw) : "—";

  if (thisRaw === null || lastRaw === null || Math.abs(thisRaw - lastRaw) < 0.05) {
    return { label, thisVal, lastVal, delta: "—", better: false, neutral: true };
  }

  const diff = thisRaw - lastRaw;
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  const formatted = format(abs);
  const delta = `${sign}${formatted}`;
  const better = higherIsBetter ? diff > 0 : diff < 0;
  return { label, thisVal, lastVal, delta, better, neutral: false };
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
  const tiles: Tile[] = [
    tile(
      "Km run",
      sumKm(thisActivities),
      sumKm(lastActivities),
      (v) => v.toFixed(1),
      true,
    ),
    tile(
      "Sessions",
      countSessions(thisActivities),
      countSessions(lastActivities),
      (v) => String(Math.round(v)),
      true,
    ),
    tile(
      "Avg wake",
      avgWake(thisDays),
      avgWake(lastDays),
      (v) => hoursToClockString(v),
      false, // earlier is better
    ),
    tile(
      "Sleep",
      avgSleepDuration(thisDays),
      avgSleepDuration(lastDays),
      (v) => `${v.toFixed(1)}h`,
      true, // more sleep is better
    ),
  ];

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">
        This week vs last
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-3"
          >
            <p className="text-[13px] tracking-[0.02em] text-text-muted">
              {t.label}
            </p>
            <p className="font-mono text-[28px] leading-none tabular-nums text-text">
              {t.thisVal}
            </p>
            <p
              className={`font-mono text-[12px] tabular-nums ${
                t.neutral
                  ? "text-text-muted"
                  : t.better
                    ? "text-accent"
                    : "text-text-muted"
              }`}
            >
              {t.delta}
              {!t.neutral && (
                <span className="ml-1 not-font-mono text-[11px]">
                  vs {t.lastVal}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
