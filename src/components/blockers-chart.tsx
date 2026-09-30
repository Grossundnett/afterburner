import { blockerLabel } from "@/lib/blockers";

const BAR_H = 16;
const GAP = 6;
const LABEL_W = 100;
const COUNT_W = 28;
const MIN_BAR_W = 4;

type DayRow = {
  blocker_code: string | null;
};

export function BlockersChart({ days }: { days: readonly DayRow[] }) {
  // Count occurrences of each non-null blocker code.
  const counts = new Map<string, number>();
  for (const d of days) {
    if (d.blocker_code) {
      counts.set(d.blocker_code, (counts.get(d.blocker_code) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-[13px] tracking-[0.02em] text-text-muted">
          What stops you
        </p>
        <p className="mt-2 text-[13px] text-text-muted">
          No blockers logged in the last 90 days.
        </p>
      </section>
    );
  }

  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, label: blockerLabel(code), count }));

  const maxCount = rows[0].count;
  const svgH = rows.length * (BAR_H + GAP) - GAP;
  const BAR_AREA_W = 180;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[13px] tracking-[0.02em] text-text-muted">
        What stops you
      </p>

      <svg
        viewBox={`0 0 ${LABEL_W + BAR_AREA_W + COUNT_W} ${svgH}`}
        className="mt-4 w-full"
        role="img"
        aria-label="Blocker frequency chart"
      >
        {rows.map(({ code, label, count }, i) => {
          const y = i * (BAR_H + GAP);
          const barW = Math.max(
            MIN_BAR_W,
            Math.round((count / maxCount) * BAR_AREA_W),
          );
          return (
            <g key={code}>
              <text
                x={LABEL_W - 4}
                y={y + BAR_H / 2 + 4}
                fill="var(--text-muted)"
                fontSize="11"
                textAnchor="end"
                fontFamily="var(--font-sans)"
              >
                {label}
              </text>
              <rect
                x={LABEL_W}
                y={y}
                width={barW}
                height={BAR_H}
                rx={3}
                fill="var(--accent)"
                fillOpacity="0.75"
              >
                <title>
                  {label}: {count}
                </title>
              </rect>
              <text
                x={LABEL_W + barW + 4}
                y={y + BAR_H / 2 + 4}
                fill="var(--text-muted)"
                fontSize="11"
                fontFamily="var(--font-mono)"
              >
                {count}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
