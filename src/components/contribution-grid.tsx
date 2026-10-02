import { addDays, formatDate } from "@/lib/dates";
import { Verdict } from "./verdict";

/** 7 rows × 13 cols = 91 cells, newest bottom-right (like GitHub). */
const ROWS = 7;
const COLS = 13;
const TOTAL = ROWS * COLS; // 91 days
const CELL = 22;
const GAP = 3;
const RADIUS = 4;

/** Minutes thresholds for the 4 trained colour steps (dim accent → full). */
const STEPS = [1, 31, 61, 91, Infinity] as const;
const PCTS = [35, 55, 75, 100] as const;

function trainedFill(minutes: number): string {
  for (let i = 0; i < STEPS.length; i++) {
    if (minutes < STEPS[i]) {
      const pct = PCTS[i];
      return pct === 100
        ? "var(--accent)"
        : `color-mix(in srgb, var(--accent) ${pct}%, var(--surface))`;
    }
  }
  return "var(--accent)";
}

type DayStatus = "not_logged" | "rest" | "blocked" | "trained";

function currentStreak(dates: string[], activityDates: Set<string>): number {
  let streak = 0;
  for (const d of dates) {
    if (activityDates.has(d)) streak++;
    else if (streak > 0) break; // gap ends the current streak
  }
  return streak;
}

function longestStreak(dates: string[], activityDates: Set<string>): number {
  let best = 0;
  let run = 0;
  for (const d of [...dates].reverse()) {
    if (activityDates.has(d)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export function ContributionGrid({
  today,
  minutesByDate,
  activeDates,
  loggedDates,
  blockedDates,
}: {
  today: string;
  minutesByDate: Map<string, number>;
  activeDates: Set<string>;
  /** Dates with a `days` row at all — distinguishes "not logged" from "rest". */
  loggedDates: Set<string>;
  /** Dates with a `days` row carrying a blocker_code. */
  blockedDates: Set<string>;
}) {
  // Build 91 dates newest-first (index 0 = today).
  const dates: string[] = [];
  for (let i = 0; i < TOTAL; i++) {
    dates.push(addDays(today, -i));
  }

  const curStreak = currentStreak(dates, activeDates);
  const longStreak = longestStreak(dates, activeDates);

  function statusOf(date: string): DayStatus {
    if (activeDates.has(date)) return "trained";
    if (blockedDates.has(date)) return "blocked";
    if (loggedDates.has(date)) return "rest";
    return "not_logged";
  }

  // Layout: 13 columns (weeks), 7 rows (Mon=0 to Sun=6).
  const cells = dates.map((date, i) => {
    const col = COLS - 1 - Math.floor(i / 7);
    const row = i % 7;
    const minutes = minutesByDate.get(date) ?? 0;
    const isToday = date === today;
    return { date, col, row, minutes, isToday, status: statusOf(date) };
  });

  const svgW = COLS * (CELL + GAP) - GAP;
  const svgH = ROWS * (CELL + GAP) - GAP;

  const dayLabels: { row: number; label: string }[] = [
    { row: 0, label: "M" },
    { row: 2, label: "W" },
    { row: 4, label: "F" },
  ];
  const LABEL_W = 14;

  const streakStatus = curStreak === 0 ? "warn" : "good";
  const streakSentence =
    curStreak === 0
      ? longStreak === 0
        ? "No streak yet — log a session to start one."
        : `No active streak right now — best was ${longStreak} days.`
      : curStreak === longStreak
        ? `${curStreak}-day streak — your best yet.`
        : `${curStreak}-day streak — best is ${longStreak}.`;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">Activity</p>

      <div className="mt-4 flex items-start gap-2">
        {/* Day labels */}
        <svg width={LABEL_W} height={svgH} aria-hidden="true">
          {dayLabels.map(({ row, label }) => (
            <text
              key={label}
              x={LABEL_W - 2}
              y={row * (CELL + GAP) + CELL / 2 + 4}
              fill="var(--text-muted)"
              fontSize="10"
              textAnchor="end"
              fontFamily="var(--font-mono)"
            >
              {label}
            </text>
          ))}
        </svg>

        {/* Grid */}
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full"
          role="img"
          aria-label={`Activity contribution grid — ${activeDates.size} active days in last 91`}
          style={{ maxWidth: svgW }}
        >
          {cells.map(({ date, col, row, minutes, isToday, status }) => {
            const x = col * (CELL + GAP);
            const y = row * (CELL + GAP);
            const titleSuffix =
              status === "trained"
                ? `: ${minutes} min trained`
                : status === "blocked"
                  ? ": blocked"
                  : status === "rest"
                    ? ": rest day"
                    : ": not logged";

            if (status === "not_logged") {
              return (
                <rect
                  key={date}
                  x={x + 1}
                  y={y + 1}
                  width={CELL - 2}
                  height={CELL - 2}
                  rx={RADIUS}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>
                    {formatDate(date, "short")}
                    {titleSuffix}
                  </title>
                </rect>
              );
            }

            return (
              <g key={date}>
                <rect
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={RADIUS}
                  fill={
                    status === "trained"
                      ? trainedFill(minutes)
                      : "var(--surface-2)"
                  }
                  stroke={isToday ? "var(--signal)" : "none"}
                  strokeWidth={isToday ? "2" : "0"}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>
                    {formatDate(date, "short")}
                    {titleSuffix}
                  </title>
                </rect>
                {status === "blocked" && (
                  <circle
                    cx={x + CELL - 5}
                    cy={y + 5}
                    r="3"
                    fill="var(--warn)"
                    aria-hidden="true"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-4 font-mono text-[10px] tabular-nums text-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-dashed border-border" />
          not logged
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-surface-2" />
          rest
        </span>
        <span className="flex items-center gap-1">
          <span className="relative inline-block h-2.5 w-2.5 rounded-[2px] bg-surface-2">
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warn" />
          </span>
          blocked
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" />
          trained
        </span>
      </div>

      <div className="mt-4 flex gap-6">
        <div>
          <p className="font-mono text-[28px] leading-none tabular-nums text-text">
            {curStreak}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">day streak</p>
        </div>
        <div>
          <p className="font-mono text-[28px] leading-none tabular-nums text-text">
            {longStreak}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">best streak</p>
        </div>
      </div>

      <Verdict status={streakStatus} sentence={streakSentence} />
    </section>
  );
}
