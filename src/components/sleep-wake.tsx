import {
  buildScale,
  linePath,
  splitOnGaps,
  unwrapClockHours,
  type SeriesPoint,
} from "@/lib/chart";
import { clockToHours, formatDate, hoursToClockString } from "@/lib/dates";

const WIDTH = 320;
const HEIGHT = 120;
const BAR_HEIGHT = 40;
const MAX_GAP_DAYS = 3;
const TARGET_WAKE_H = 7; // 07:00
const TARGET_SLEEP_H = 7; // 7-hour sleep target for the duration bar

type DayRow = {
  date: string;
  wake_time: string | null;
  sleep_time: string | null;
};

export function SleepWake({
  days,
  today,
}: {
  days: readonly DayRow[];
  today: string;
}) {
  const wakePoints: SeriesPoint[] = days.flatMap((d) =>
    d.wake_time ? [{ date: d.date, value: clockToHours(d.wake_time) }] : [],
  );
  const sleepPoints: SeriesPoint[] = days.flatMap((d) =>
    d.sleep_time ? [{ date: d.date, value: unwrapClockHours(d.sleep_time) }] : [],
  );

  if (wakePoints.length === 0 && sleepPoints.length === 0) {
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

  // Build scale over the union of both series so both share the same y-axis.
  const allPoints = [...wakePoints, ...sleepPoints].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  const scale = buildScale(allPoints, WIDTH, HEIGHT, { endDate: today });
  if (!scale) return null;

  const wakeSegments = splitOnGaps(wakePoints, MAX_GAP_DAYS);
  const sleepSegments = splitOnGaps(sleepPoints, MAX_GAP_DAYS);

  // 07:00 shaded band — ±30 min around the target.
  const bandTop = scale.y(TARGET_WAKE_H + 0.5);
  const bandBot = scale.y(TARGET_WAKE_H - 0.5);
  const bandH = Math.abs(bandBot - bandTop);
  const bandY = Math.min(bandTop, bandBot);

  // Sleep duration bars.
  const durationPairs: { date: string; hours: number }[] = days.flatMap((d) => {
    if (!d.wake_time || !d.sleep_time) return [];
    const wake = clockToHours(d.wake_time);
    const sleep = unwrapClockHours(d.sleep_time);
    const dur = sleep >= 24 ? wake + 24 - sleep : wake + 24 - sleep;
    return dur > 0 && dur < 16 ? [{ date: d.date, hours: dur }] : [];
  });

  const maxDur = Math.max(...durationPairs.map((d) => d.hours), TARGET_SLEEP_H);

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">
        Sleep & wake
      </p>

      {/* Wake & sleep time chart */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 w-full"
        role="img"
        aria-label="Wake and sleep times over 90 days"
        preserveAspectRatio="none"
      >
        {/* 07:00 target band — signal at 12% */}
        <rect
          x={0}
          y={bandY}
          width={WIDTH}
          height={Math.max(bandH, 2)}
          fill="var(--signal)"
          fillOpacity="0.12"
        />
        <line
          x1={0}
          y1={scale.y(TARGET_WAKE_H)}
          x2={WIDTH}
          y2={scale.y(TARGET_WAKE_H)}
          stroke="var(--signal)"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={WIDTH - 2}
          y={scale.y(TARGET_WAKE_H) - 3}
          fill="var(--signal)"
          fontSize="10"
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          07:00
        </text>

        {/* Sleep line — second series, drawn first so wake sits on top */}
        {sleepSegments.map((seg, i) => (
          <path
            key={`s${i}`}
            d={linePath(seg, scale)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeOpacity="0.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Wake line — accent at full strength */}
        {wakeSegments.map((seg, i) => (
          <path
            key={`w${i}`}
            d={linePath(seg, scale)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Wake dots */}
        {wakePoints.map((p) => (
          <circle
            key={p.date}
            cx={scale.x(p.date)}
            cy={scale.y(p.value)}
            r="3.5"
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {formatDate(p.date, "short")}: wake {hoursToClockString(p.value)}
            </title>
          </circle>
        ))}

        {/* Sleep dots */}
        {sleepPoints.map((p) => (
          <circle
            key={p.date}
            cx={scale.x(p.date)}
            cy={scale.y(p.value)}
            r="2.5"
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeOpacity="0.6"
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {formatDate(p.date, "short")}: sleep{" "}
              {hoursToClockString(p.value >= 24 ? p.value - 24 : p.value)}
            </title>
          </circle>
        ))}
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-text-muted">
        <span>wake</span>
        <span>sleep (faint)</span>
      </div>

      {/* Sleep duration bars */}
      {durationPairs.length > 0 && (
        <>
          <p className="mt-4 text-[13px] tracking-[0.02em] text-text-muted">
            Sleep duration
          </p>
          <svg
            viewBox={`0 0 ${WIDTH} ${BAR_HEIGHT}`}
            className="mt-2 w-full"
            role="img"
            aria-label="Sleep duration bars"
            preserveAspectRatio="none"
          >
            {/* 7h target line */}
            {(() => {
              const targetY =
                BAR_HEIGHT - (TARGET_SLEEP_H / maxDur) * BAR_HEIGHT;
              return (
                <>
                  <line
                    x1={0}
                    y1={targetY}
                    x2={WIDTH}
                    y2={targetY}
                    stroke="var(--signal)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={2}
                    y={targetY - 2}
                    fill="var(--signal)"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                  >
                    7 h
                  </text>
                </>
              );
            })()}

            {durationPairs.map(({ date, hours }) => {
              const barX = scale.x(date) - 3;
              const barH = (hours / maxDur) * BAR_HEIGHT;
              const barY = BAR_HEIGHT - barH;
              return (
                <rect
                  key={date}
                  x={barX}
                  y={barY}
                  width={6}
                  height={barH}
                  rx={1}
                  fill="var(--accent)"
                  fillOpacity="0.6"
                >
                  <title>
                    {formatDate(date, "short")}: {hours.toFixed(1)} h sleep
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
