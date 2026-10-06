import { addDays, formatDate } from "@/lib/dates";
import { Verdict } from "./verdict";

/** 7 rows × 13 cols = 91 cells, newest bottom-right (like GitHub). */
const ROWS = 7;
const COLS = 13;
const TOTAL = ROWS * COLS; // 91 days
const CELL = 22;
const GAP = 3;
const RADIUS = 4;

/** Minutes thresholds for the 4 trained colour steps (dim accent → full).
 *  Floor raised from the original 35% to 45%: anything dimmer than that sat
 *  too close to the "rest" fill to read as a different state at a glance. */
const STEPS = [1, 31, 61, 91, Infinity] as const;
const PCTS = [45, 62, 80, 100] as const;

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

/** Fill, border and animation shared across one status — not just a colour,
 *  so the four states differ in more than brightness (RESEARCH.md §2.3: a
 *  sequential ramp alone made three of the four read as "grey"). */
const CELL_STYLE: Record<
  Exclude<DayStatus, "trained">,
  { fill: string; stroke: string; strokeWidth: string; dash?: string }
> = {
  not_logged: {
    fill: "var(--bg)",
    stroke: "var(--border)",
    strokeWidth: "1.25",
    dash: "2 2",
  },
  rest: {
    fill: "var(--surface-2)",
    stroke: "var(--border)",
    strokeWidth: "1",
  },
  blocked: {
    fill: "color-mix(in srgb, var(--warn) 24%, var(--surface-2))",
    stroke: "var(--warn)",
    strokeWidth: "1.25",
  },
};

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

  // Layout: 13 columns (weeks), 7 rows (Mon=0 to Sun=6). `order` is reading
  // order — left column (oldest) to right (today), top to bottom within a
  // week — for the entrance animation below, independent of (col, row)'s
  // role in pixel placement.
  const cells = dates.map((date, i) => {
    const col = COLS - 1 - Math.floor(i / 7);
    const row = i % 7;
    const minutes = minutesByDate.get(date) ?? 0;
    const isToday = date === today;
    return {
      date,
      col,
      row,
      minutes,
      isToday,
      status: statusOf(date),
      order: col * ROWS + row,
    };
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

      {/* Headline first, matching every other Panel card — the streak was
          previously stranded below the grid, reading as an afterthought. */}
      <div className="mt-2 flex gap-6">
        <div>
          <p className="font-mono text-[36px] leading-none tabular-nums text-text">
            {curStreak}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">day streak</p>
        </div>
        <div>
          <p className="font-mono text-[36px] leading-none tabular-nums text-text">
            {longStreak}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">best streak</p>
        </div>
      </div>

      <Verdict status={streakStatus} sentence={streakSentence} />

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

        {/* Grid. No width cap: it fills the card edge-to-edge at whatever
            size the viewport gives it, instead of being clamped to a fixed
            pixel width that left most of a wide desktop card empty. */}
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full"
          role="img"
          aria-label={`Activity contribution grid — ${activeDates.size} active days in last 91`}
        >
          {cells.map(({ date, col, row, minutes, isToday, status, order }) => {
            const x = col * (CELL + GAP);
            const y = row * (CELL + GAP);
            const cx = x + CELL / 2;
            const cy = y + CELL / 2;
            const titleSuffix =
              status === "trained"
                ? `: ${minutes} min trained`
                : status === "blocked"
                  ? ": blocked"
                  : status === "rest"
                    ? ": rest day"
                    : ": not logged";
            const style = status === "trained" ? null : CELL_STYLE[status];
            // Staggered left-to-right, top-to-bottom build. Each cell's own
            // animation is short; the stagger is what reads as "filling in" —
            // together they land under 600ms (RESEARCH.md §2.7).
            const delay = `${(order * 3.2).toFixed(1)}ms`;

            return (
              <rect
                key={date}
                className="grid-cell-in"
                style={{ animationDelay: delay, transformOrigin: `${cx}px ${cy}px` }}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={RADIUS}
                fill={status === "trained" ? trainedFill(minutes) : style!.fill}
                stroke={isToday ? "var(--signal)" : style?.stroke ?? "none"}
                strokeWidth={isToday ? "2" : style?.strokeWidth ?? "0"}
                strokeDasharray={isToday ? undefined : style?.dash}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {formatDate(date, "short")}
                  {titleSuffix}
                </title>
              </rect>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] tabular-nums text-text-muted">
        <span
          className="flex items-center gap-1.5"
          title="No log entry at all — the form was never opened for this day"
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{
              background: "var(--bg)",
              border: "1.25px dashed var(--border)",
            }}
          />
          not logged
        </span>
        <span
          className="flex items-center gap-1.5"
          title="Logged the day, no activity and no blocker — an intentional rest"
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px] bg-surface-2"
            style={{ border: "1px solid var(--border)" }}
          />
          rest
        </span>
        <span
          className="flex items-center gap-1.5"
          title="Logged a blocker (e.g. slept late, work ran over) — something got in the way"
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{
              background:
                "color-mix(in srgb, var(--warn) 24%, var(--surface-2))",
              border: "1.25px solid var(--warn)",
            }}
          />
          blocked
        </span>
        <span
          className="flex items-center gap-1.5"
          title="At least one activity was logged — brighter means more minutes"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" />
          trained
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-text-muted">
        Hover a cell for details · blocked = logged a blocker but didn't train
      </p>
    </section>
  );
}
