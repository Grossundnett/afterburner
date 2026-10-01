import { addDays, formatDate } from "@/lib/dates";

/** 7 rows × 13 cols = 91 cells, newest bottom-right (like GitHub). */
const ROWS = 7;
const COLS = 13;
const TOTAL = ROWS * COLS; // 91 days
const CELL = 22;
const GAP = 3;
const RADIUS = 4;

/** Minutes thresholds for the 5 colour steps (surface → full accent). */
const STEPS = [0, 1, 31, 61, 91, Infinity] as const;
/** color-mix percentages per step index 0-4. */
const PCTS = [0, 25, 50, 75, 100] as const;

function stepIndex(minutes: number): number {
  for (let i = 0; i < STEPS.length - 1; i++) {
    if (minutes < STEPS[i + 1]) return i;
  }
  return PCTS.length - 1;
}

function cellColor(minutes: number): string {
  const pct = PCTS[stepIndex(minutes)];
  if (pct === 0) return "var(--surface)";
  if (pct === 100) return "var(--accent)";
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--surface))`;
}

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
}: {
  today: string;
  minutesByDate: Map<string, number>;
  activeDates: Set<string>;
}) {
  // Build 91 dates newest-first (index 0 = today).
  const dates: string[] = [];
  for (let i = 0; i < TOTAL; i++) {
    dates.push(addDays(today, -i));
  }

  const curStreak = currentStreak(dates, activeDates);
  const longStreak = longestStreak(dates, activeDates);

  // Layout: 13 columns (weeks), 7 rows (Mon=0 to Sun=6).
  // dates[0] = today. Position in grid: column from right = Math.floor(i/7),
  // row = i % 7 but offset so the first column starts on the correct weekday.
  // Simpler: place each date by (col, row) where col = Math.floor(i/7) from
  // the right, row = i % 7. Then flip: col from left = COLS - 1 - col.
  const cells = dates.map((date, i) => {
    const col = COLS - 1 - Math.floor(i / 7);
    const row = i % 7;
    const minutes = minutesByDate.get(date) ?? 0;
    const isToday = date === today;
    return { date, col, row, minutes, isToday };
  });

  const svgW = COLS * (CELL + GAP) - GAP;
  const svgH = ROWS * (CELL + GAP) - GAP;

  // Day labels: M W F only to save width. Rows 0=Mon,1=Tue,2=Wed,3=Thu,4=Fri,5=Sat,6=Sun
  const dayLabels: { row: number; label: string }[] = [
    { row: 0, label: "M" },
    { row: 2, label: "W" },
    { row: 4, label: "F" },
  ];
  const LABEL_W = 14;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">Activity</p>

      <div className="mt-4 flex items-start gap-2">
        {/* Day labels */}
        <svg
          width={LABEL_W}
          height={svgH}
          aria-hidden="true"
        >
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
          {cells.map(({ date, col, row, minutes, isToday }) => {
            const x = col * (CELL + GAP);
            const y = row * (CELL + GAP);
            return (
              <rect
                key={date}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={RADIUS}
                style={{ fill: cellColor(minutes) }}
                stroke={isToday ? "var(--signal)" : "none"}
                strokeWidth={isToday ? "2" : "0"}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {formatDate(date, "short")}
                  {minutes > 0 ? `: ${minutes} min` : ": no activity"}
                </title>
              </rect>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex gap-6">
        <div>
          <p className="font-mono text-[28px] leading-none tabular-nums text-text">
            {curStreak}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            day streak
          </p>
        </div>
        <div>
          <p className="font-mono text-[28px] leading-none tabular-nums text-text">
            {longStreak}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            best streak
          </p>
        </div>
      </div>
    </section>
  );
}
