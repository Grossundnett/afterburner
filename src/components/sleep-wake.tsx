import { buildScale, unwrapClockHours } from "@/lib/chart";
import { clockToHours, formatDate, hoursToClockString } from "@/lib/dates";
import { Verdict, type Status } from "./verdict";

const WIDTH = 320;
const HEIGHT = 140;
const BAR_W = 5;
const TARGET_SLEEP_H = 23; // 23:00, unwrapped
const TARGET_WAKE_H = 7; // 07:00
const TARGET_DURATION_H = 7;

type DayRow = {
  date: string;
  wake_time: string | null;
  sleep_time: string | null;
};

type Night = { date: string; sleep: number; wake: number; duration: number };

export function SleepWake({
  days,
  today,
}: {
  days: readonly DayRow[];
  today: string;
}) {
  const nights: Night[] = days.flatMap((d) => {
    if (!d.wake_time || !d.sleep_time) return [];
    const wake = clockToHours(d.wake_time);
    const sleep = unwrapClockHours(d.sleep_time);
    const duration = wake + 24 - sleep;
    return duration > 0 && duration < 16
      ? [{ date: d.date, sleep, wake: wake + 24, duration }]
      : [];
  });

  if (nights.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-[13px] tracking-[0.02em] text-text-muted">
          Sleep & wake
        </p>
        <p className="mt-2 text-[13px] text-text-muted">
          No sleep data in the last 90 days.
        </p>
      </section>
    );
  }

  const avgDuration =
    nights.reduce((s, n) => s + n.duration, 0) / nights.length;
  const avgWake = nights.reduce((s, n) => s + n.wake, 0) / nights.length - 24;

  const status: Status =
    avgDuration >= TARGET_DURATION_H - 0.25
      ? "good"
      : avgDuration >= TARGET_DURATION_H - 1
        ? "warn"
        : "bad";
  const sentence =
    avgDuration >= TARGET_DURATION_H - 0.25
      ? `Averaging ${avgDuration.toFixed(1)}h, at or above your ${TARGET_DURATION_H}h target.`
      : `Averaging ${avgDuration.toFixed(1)}h, ${(TARGET_DURATION_H - avgDuration).toFixed(1)}h short of your ${TARGET_DURATION_H}h target.`;

  // Scale over sleep/wake extremes so bars have headroom above and below.
  const allValues = nights.flatMap((n) => [n.sleep, n.wake]);
  const points = nights.map((n) => ({ date: n.date, value: n.wake }));
  const scale = buildScale(
    [
      ...points,
      { date: nights[0].date, value: Math.min(...allValues) },
      { date: nights[0].date, value: Math.max(...allValues) },
    ],
    WIDTH,
    HEIGHT,
    { endDate: today },
  );
  if (!scale) return null;

  // Target band: 23:00 (sleep) to next day 07:00 (wake), drawn behind bars.
  const bandTop = scale.y(TARGET_WAKE_H + 24);
  const bandBot = scale.y(TARGET_SLEEP_H);
  const bandY = Math.min(bandTop, bandBot);
  const bandH = Math.abs(bandBot - bandTop);

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">
        Sleep & wake
      </p>

      <p className="mt-2 font-mono text-[36px] leading-none tabular-nums text-text">
        {avgDuration.toFixed(1)}
        <span className="text-[15px] text-text-muted"> h avg</span>
      </p>

      <Verdict status={status} sentence={sentence} />

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 w-full"
        role="img"
        aria-label={`Sleep and wake range per night, averaging ${avgDuration.toFixed(1)} hours, over 90 days`}
        preserveAspectRatio="none"
      >
        {/* Target window: 23:00 to 07:00, behind everything */}
        <rect
          x={0}
          y={bandY}
          width={WIDTH}
          height={Math.max(bandH, 2)}
          fill="var(--signal)"
          fillOpacity="0.1"
        />
        <text
          x={WIDTH - 2}
          y={scale.y(TARGET_WAKE_H + 24) - 3}
          fill="var(--signal)"
          fontSize="9"
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          target
        </text>

        {/* One floating bar per night, bedtime → wake */}
        {nights.map((n) => {
          const x = scale.x(n.date) - BAR_W / 2;
          const yTop = scale.y(n.wake);
          const yBot = scale.y(n.sleep);
          const hit = n.duration >= TARGET_DURATION_H - 0.5;
          return (
            <rect
              key={n.date}
              x={x}
              y={yTop}
              width={BAR_W}
              height={Math.max(yBot - yTop, 2)}
              rx={BAR_W / 2}
              fill={hit ? "var(--good)" : "var(--accent)"}
              fillOpacity={hit ? 0.85 : 0.6}
            >
              <title>
                {formatDate(n.date, "short")}: {hoursToClockString(n.sleep)} –{" "}
                {hoursToClockString(n.wake)} ({n.duration.toFixed(1)}h)
              </title>
            </rect>
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-text-muted">
        <span>bedtime → wake</span>
        <span>avg wake {hoursToClockString(avgWake)}</span>
      </div>
    </section>
  );
}
