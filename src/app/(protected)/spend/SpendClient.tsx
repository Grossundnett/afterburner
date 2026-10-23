"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";

import { addDays, daysBetween } from "@/lib/dates";

import { coverOverspend, deleteExpense, tickTransfer } from "./actions";
import { QuickAddClient, type QuickCategory } from "./quick-add/QuickAddClient";

export type SpendCategory = {
  key: string;
  label: string;
  emoji: string;
  kind: string;
  sort: number;
  group: string | null;
  subgroup: string | null;
};

export type Expense = {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  spent_on: string;
  created_at: string;
};

export type DashboardCategory = {
  budget: number;
  spent: number;
  pace: number;
  over: boolean;
  kind: "weekly" | "monthly" | "fund";
  late_tax: { budget: number; spent: number; over: boolean } | null;
};

export type Dashboard =
  | { has_plan: false; cycle_start: string; cycle_end: string }
  | {
      has_plan: true;
      cycle_start: string;
      cycle_end: string;
      new_rules: boolean;
      discretionary_cap: number;
      incap_total: number;
      unassigned: number;
      big_buy_fund: number;
      cycle_spent_total: number;
      month_debt: number;
      budget_left_this_week: number;
      spent_this_week: number;
      real_money_left: number;
      remaining_weeks: number;
      cash_left_this_week: number;
      binding: "cash" | "budget";
      balances: Record<string, number>;
      count_bob_as_cash: boolean;
      categories: Record<string, DashboardCategory>;
    };

type Props = {
  weekMon: string;
  currentWeekMon: string;
  today: string;
  initialExpenses: Expense[];
  quickAddCategories: QuickCategory[];
  categories: SpendCategory[];
  dashboard: Dashboard;
  isMonday: boolean;
  transferTicked: boolean;
  emotionStat: { pct: number; tag: string } | null;
};

const BUCKETS = ["Food", "Transport", "Fun", "Subscriptions", "Big Buy", "Other"] as const;

// Overflow caps at +50% past the budget mark, so one blown bar can't make the
// others unreadable. The real rupee figure next to it carries the magnitude.
const BAR_SCALE = 1.5;
const BUDGET_MARK_PCT = 100 / BAR_SCALE; // 66.67%

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Parses a stored Y-M-D date in UTC so formatting never shifts it a day,
 * the same guard dates.ts uses for every date it renders. */
function dateParts(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const dmon = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    dateParts(iso),
  );
const weekdayLong = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" }).format(dateParts(iso));

const focusRing =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal";

type OptimisticAction = { type: "add"; expense: Expense } | { type: "delete"; id: string };

function reduce(state: Expense[], action: OptimisticAction): Expense[] {
  if (action.type === "add") return [action.expense, ...state];
  return state.filter((e) => e.id !== action.id);
}

function bucketMeta(categories: SpendCategory[], bucket: string) {
  const rep =
    categories.find((c) => c.key === bucket) ??
    categories.find((c) => c.group === bucket) ??
    null;
  return { emoji: rep?.emoji ?? "📦" };
}

/** Progress bar for one bucket. 100% budget sits at BUDGET_MARK_PCT (66.67%)
 * of the track; the overflow lane past it is distinctly coloured and capped
 * at +50% of budget. A pace tick (when meaningfully short of the budget
 * mark) shows where spend "should" be today; crossing it while still under
 * budget turns the fill amber — never colour alone, the "over"/"left" text
 * always carries the same signal in words. */
function BudgetBar({
  emoji,
  label,
  total,
  budget,
  pace,
  sub,
  kind,
}: {
  emoji: string;
  label: string;
  total: number;
  budget: number;
  pace?: number;
  sub?: { label: string; spent: number; budget: number; over: boolean } | null;
  kind?: "weekly" | "monthly" | "fund";
}) {
  const isFund = kind === "fund";
  const pct = budget > 0 ? (total / budget) * 100 : 0;
  const isOver = pct > 100;
  // A fund isn't a budget you pace against — it just has money in it or it
  // doesn't, so the pace tick (and the amber "ahead of pace" framing) never
  // applies to it.
  const pacePct = !isFund && pace != null && budget > 0 ? Math.min(100, (pace / budget) * 100) : null;
  const aheadOfPace = !isFund && !isOver && pacePct != null && pct > pacePct + 0.5;
  const basePct = Math.min(100, pct) / BAR_SCALE;
  const overflowPct = isOver ? Math.min(50, pct - 100) / BAR_SCALE : 0;
  const delta = Math.abs(budget - total);
  const sideLabel = isFund
    ? isOver
      ? `${money.format(delta)} over the fund`
      : `${money.format(delta)} available`
    : budget === 0
      ? "no budget"
      : isOver
        ? `${money.format(delta)} over`
        : `${money.format(delta)} left`;

  const fillColor = isOver ? "bg-over" : aheadOfPace ? "bg-signal" : "bg-accent";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[0.92rem]">
        <span className="flex items-center gap-1.5 text-text">
          <span>{emoji}</span>
          <span>{label}</span>
        </span>
        <span className={`font-bold tabular-nums ${isOver ? "text-over" : "text-text"}`}>
          {budget > 0 ? `${money.format(total)} / ${money.format(budget)}` : money.format(total)}
        </span>
      </div>

      {budget > 0 ? (
        <div className="relative h-[8px] w-full rounded-full bg-border">
          <div
            className={`bar-fill absolute inset-y-0 left-0 rounded-full ${fillColor}`}
            style={{ width: `${basePct}%` }}
          />
          {isOver && (
            <div
              className="bar-fill absolute inset-y-0 flex items-center justify-end overflow-hidden rounded-r-full bg-over pr-1 text-[9px] leading-none text-accent-ink"
              style={{ left: `${BUDGET_MARK_PCT}%`, width: `${overflowPct}%`, animationDelay: "180ms" }}
            >
              <span aria-hidden="true">⚡</span>
            </div>
          )}
          <div
            className="pointer-events-none absolute top-[-3px] bottom-[-3px] w-px bg-text/35"
            style={{ left: `${BUDGET_MARK_PCT}%` }}
            aria-hidden="true"
          />
          {pacePct != null && pacePct < 99 && (
            <div
              className="pointer-events-none absolute top-[-3px] bottom-[-3px] w-px bg-text/70"
              style={{ left: `${(pacePct / 100) * BUDGET_MARK_PCT}%` }}
              aria-hidden="true"
              title="today's pace"
            />
          )}
        </div>
      ) : (
        <div className="h-[8px] w-full rounded-full bg-border/50" />
      )}

      <p className={`text-[0.78rem] ${isOver ? "text-over" : aheadOfPace ? "text-signal" : "text-text-muted"}`}>
        {sideLabel}
      </p>

      {sub && (
        <p className={`text-[0.76rem] ${sub.over ? "text-over" : "text-text-muted"}`}>
          {sub.label}: {money.format(sub.spent)} / {money.format(sub.budget)}
          {sub.over ? " — over" : ""}
        </p>
      )}
    </div>
  );
}

export function SpendClient({
  weekMon,
  currentWeekMon,
  today,
  initialExpenses,
  quickAddCategories,
  categories,
  dashboard,
  isMonday,
  transferTicked,
  emotionStat,
}: Props) {
  function catMeta(key: string) {
    return categories.find((c) => c.key === key) ?? { emoji: "📦", label: key };
  }
  const [expenses, applyOptimistic] = useOptimistic(initialExpenses, reduce);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveDone, setMoveDone] = useState(false);
  const [ticked, setTicked] = useState(transferTicked);
  const [tickError, setTickError] = useState<string | null>(null);

  function handleTickTransfer() {
    setTickError(null);
    setTicked(true); // optimistic — reverted below on failure
    startTransition(async () => {
      const result = await tickTransfer();
      if (result?.error) {
        setTickError(result.error);
        setTicked(false);
      }
    });
  }

  const weekSun = addDays(weekMon, 6);
  const isCurrentWeek = weekMon === currentWeekMon;
  const isLastWeek = weekMon === addDays(currentWeekMon, -7);

  function handleDelete(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      const result = await deleteExpense(id);
      if (result?.error) setFormError(result.error);
    });
  }

  // --- Category breakdown (collapsed "Where it went") --------------------
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const categoryTotals = [...expenses
    .reduce<Map<string, number>>((map, e) => {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
      return map;
    }, new Map())
    .entries()]
    .map(([cat, total]) => ({ cat, total }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // --- Dashboard-derived bucket rows, sorted by overspend -----------------
  const bucketRows = useMemo(() => {
    if (!dashboard.has_plan) return [];
    return BUCKETS.map((bucket) => {
      const c = dashboard.categories[bucket];
      if (!c) return null;
      const meta = bucketMeta(categories, bucket);
      return {
        bucket,
        emoji: meta.emoji,
        total: c.spent,
        budget: c.budget,
        pace: c.kind === "monthly" ? c.pace : undefined,
        kind: c.kind,
        // A fund being under its own total is never "overspend" in the
        // mover's sense — Big Buy is never a candidate to cover from or
        // to be covered, so it should never sort to the top of the list.
        over: c.kind === "fund" ? -Infinity : c.spent - c.budget,
        sub:
          c.late_tax != null
            ? { label: "Late tax", spent: c.late_tax.spent, budget: c.late_tax.budget, over: c.late_tax.over }
            : null,
      };
    })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.over - a.over);
  }, [dashboard, categories]);

  // --- This week's move: worst over-budget bucket, covered from the one
  // with the most room. Omitted entirely when nothing is over — an
  // encouraging message with no number attached is exactly what the
  // research brief rules out, and "nothing to move" has no number to show.
  //
  // Food and Transport are never donors — they're essentials, not slack to
  // raid. Big Buy's fund is never a donor either — it isn't budget money in
  // the same pool, it's a separate accrual that happens to render as a bar.
  // And Cover is only offered when a single eligible donor's own room
  // fully resolves the overspend; the UI moves from one bucket at a time,
  // so proposing a move that leaves the bucket still over is worse than no
  // suggestion. When nothing qualifies, say so with the number rather than
  // silently going quiet or pretending a partial cover would help.
  const ESSENTIAL_BUCKETS = new Set(["Food", "Transport"]);
  const mover = useMemo(() => {
    if (!dashboard.has_plan) return null;
    const overs = bucketRows.filter((r) => r.over > 0);
    if (overs.length === 0) return null;
    const worst = overs[0];
    const donors = bucketRows
      .filter(
        (r) =>
          r.bucket !== worst.bucket &&
          !ESSENTIAL_BUCKETS.has(r.bucket) &&
          r.kind !== "fund" &&
          r.budget - r.total > 0,
      )
      .sort((a, b) => (b.budget - b.total) - (a.budget - a.total));

    const bestDonor = donors[0];
    const bestRoom = bestDonor ? bestDonor.budget - bestDonor.total : 0;

    if (!bestDonor || bestRoom < worst.over) {
      return { worst, tooLarge: true as const };
    }

    return {
      worst,
      tooLarge: false as const,
      donor: bestDonor,
      donorRoom: bestRoom,
      moveAmt: Math.round(worst.over),
    };
  }, [dashboard, bucketRows]);

  function handleCover() {
    if (!mover || mover.tooLarge) return;
    setMoveError(null);
    startTransition(async () => {
      const result = await coverOverspend({
        from: mover.donor.bucket,
        to: mover.worst.bucket,
        amount: mover.moveAmt,
      });
      if (result?.error) {
        setMoveError(result.error);
        return;
      }
      setMoveDone(true);
    });
  }

  // --- Grouped list (collapsed "Every spend this week") -------------------
  const byDay = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = byDay.get(e.spent_on) ?? [];
    list.push(e);
    byDay.set(e.spent_on, list);
  }
  const dayKeys = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : -1));

  // --- Week nav (collapsed section only) -----------------------------------
  const prevWeekHref = `/spend?week=${addDays(weekMon, -7)}`;
  const nextWeekHref = isCurrentWeek ? null : `/spend?week=${addDays(weekMon, 7)}`;
  const weekName = isCurrentWeek ? "This week" : isLastWeek ? "Last week" : `Week of ${dmon(weekMon)}`;

  const navBtn =
    `flex h-[38px] w-[38px] items-center justify-center rounded-full border-[1.5px] border-border text-lg text-text transition-colors hover:border-accent ${focusRing}`;

  // --- Hero ----------------------------------------------------------------
  const currentWeekSun = addDays(currentWeekMon, 6);
  const daysLeftInWeek = daysBetween(today, currentWeekSun) + 1;
  const isSunday = today === currentWeekSun;

  return (
    <div className="flex flex-col gap-7">
      {/* Hero */}
      {!dashboard.has_plan ? (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <h1 className="font-spend-display text-[1.2rem] font-bold text-text">
            No budget set for this cycle
          </h1>
          <p className="text-[0.9rem] text-text-muted">
            {dmon(dashboard.cycle_start)} – {dmon(dashboard.cycle_end)}
          </p>
          <Link
            href="/spend/plan"
            className={`self-start font-bold text-accent underline underline-offset-4 ${focusRing}`}
          >
            Set the plan →
          </Link>
        </div>
      ) : (
        <div aria-live="polite" className="flex flex-col">
          {(() => {
            const heroValue = Math.min(dashboard.budget_left_this_week, dashboard.cash_left_this_week);
            const over = heroValue < 0;
            const perDay = heroValue / Math.max(daysLeftInWeek, 1);
            return (
              <>
                <p
                  className={`font-spend-display font-extrabold leading-[0.95] tracking-[-0.03em] text-[clamp(3rem,13vw,5.4rem)] ${
                    over ? "text-over" : "text-text"
                  }`}
                >
                  {money.format(Math.abs(heroValue))}
                </p>
                <p className="font-spend-display text-[1.25rem] font-medium text-text">
                  {over ? "over this week" : "left this week"}
                </p>
                <p className="mt-[10px] text-text-muted">
                  {money.format(Math.abs(perDay))}/day · {daysLeftInWeek} {daysLeftInWeek === 1 ? "day" : "days"} left
                </p>
                {dashboard.binding === "cash" && (
                  <p className="mt-1 text-[0.88rem] font-bold text-signal">
                    Limited by cash, not budget.
                  </p>
                )}
                {dashboard.month_debt > 0 && (
                  <p className="mt-1 text-[0.85rem] text-over">
                    {money.format(dashboard.month_debt)} carried in as month debt.
                  </p>
                )}
              </>
            );
          })()}
        </div>
      )}

      {dashboard.has_plan && isSunday && (
        <Link
          href="/spend/review"
          className={`self-start font-bold text-accent underline underline-offset-4 ${focusRing}`}
        >
          This week&apos;s review →
        </Link>
      )}

      {/* Monday transfer reminder — only on Monday, only until ticked for
          this ISO week. Disappears Tuesday regardless of tick state; it's
          targeted friction on habit formation, not a standing nag. */}
      {dashboard.has_plan && isMonday && !ticked && (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <p className="text-text">
            Transfer{" "}
            <strong>
              {money.format(
                dashboard.binding === "cash"
                  ? dashboard.cash_left_this_week
                  : dashboard.budget_left_this_week,
              )}
            </strong>{" "}
            to Apex.
          </p>
          {tickError ? <p className="text-[0.85rem] text-over">{tickError}</p> : null}
          <button
            type="button"
            onClick={handleTickTransfer}
            className={`self-start rounded-[10px] bg-accent px-4 py-2 font-bold text-accent-ink ${focusRing}`}
          >
            Done
          </button>
        </div>
      )}

      {/* This week's move */}
      {dashboard.has_plan && mover && !moveDone && (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-signal/50 bg-surface p-4">
          {mover.tooLarge ? (
            <p className="text-text">
              <strong>{mover.worst.bucket}</strong> is {money.format(mover.worst.over)} over — too big to
              cover this month. It&apos;s carried as month debt.
            </p>
          ) : (
            <>
              <p className="text-text">
                <strong>{mover.worst.bucket}</strong> is {money.format(mover.worst.over)} over. Cover it
                from <strong>{mover.donor.bucket}</strong> ({money.format(mover.donorRoom)} left)?
              </p>
              {moveError ? <p className="text-[0.85rem] text-over">{moveError}</p> : null}
              <button
                type="button"
                aria-disabled={isPending}
                onClick={handleCover}
                className={`self-start rounded-[10px] bg-accent px-4 py-2 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
              >
                Cover {money.format(mover.moveAmt)}
              </button>
            </>
          )}
        </div>
      )}
      {moveDone && (
        <p className="text-[0.85rem] text-text-muted">Moved. The bars below update on next load.</p>
      )}

      {/* Six category bars, sorted by overspend */}
      {dashboard.has_plan && bucketRows.length > 0 && (
        <div className="flex flex-col gap-4">
          {bucketRows.map((r) => (
            <BudgetBar
              key={r.bucket}
              emoji={r.emoji}
              label={r.bucket}
              total={r.total}
              budget={r.budget}
              pace={r.pace}
              sub={r.sub}
              kind={r.kind}
            />
          ))}
        </div>
      )}

      {emotionStat && (
        <p className="text-[0.82rem] text-text-muted">
          {emotionStat.pct}% of Fun/Big Buy spend these last 4 weeks was tagged{" "}
          <span className="capitalize">{emotionStat.tag}</span>.
        </p>
      )}

      {/* Month strip */}
      {dashboard.has_plan && (
        <div className="flex flex-col gap-1 border-y border-border py-3 text-[0.85rem] text-text-muted">
          <div className="h-[4px] w-full overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full ${dashboard.cycle_spent_total > dashboard.discretionary_cap ? "bg-over" : "bg-accent"}`}
              style={{
                width: `${Math.min(100, (dashboard.cycle_spent_total / Math.max(dashboard.discretionary_cap, 1)) * 100)}%`,
              }}
            />
          </div>
          <p>
            {money.format(dashboard.cycle_spent_total)} of {money.format(dashboard.discretionary_cap)} ·
            real money {money.format(dashboard.real_money_left)} ·{" "}
            {(() => {
              const dayOfCycle = daysBetween(dashboard.cycle_start, today) + 1;
              const cycleLen = daysBetween(dashboard.cycle_start, dashboard.cycle_end) + 1;
              const projected = (dashboard.cycle_spent_total / Math.max(dayOfCycle, 1)) * cycleLen;
              return `on pace for ${money.format(projected)}`;
            })()}
          </p>
        </div>
      )}

      {/* Sticky quick-add */}
      <a
        href="#log-spend"
        aria-label="Log a spend"
        className={`fixed bottom-[22px] right-[22px] z-10 flex h-[56px] w-[56px] items-center justify-center rounded-full bg-accent text-[1.8rem] font-bold text-accent-ink shadow-lg ${focusRing}`}
      >
        +
      </a>

      {/* ===================== below the fold ===================== */}

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-6">
        <div className="flex items-center gap-3">
          <Link href={prevWeekHref} aria-label="Previous week" className={navBtn}>
            ‹
          </Link>
          <div>
            <p className="font-spend-display text-[1.05rem] font-bold text-text">{weekName}</p>
            <p className="text-[0.9rem] text-text-muted">
              {dmon(weekMon)} to {dmon(weekSun)}
            </p>
          </div>
          {nextWeekHref ? (
            <Link href={nextWeekHref} aria-label="Next week" className={navBtn}>
              ›
            </Link>
          ) : (
            <span aria-label="Next week" aria-disabled="true" className={`${navBtn} pointer-events-none opacity-35`}>
              ›
            </span>
          )}
        </div>
        <Link
          href="/spend/plan"
          className={`shrink-0 whitespace-nowrap text-[13px] text-text-muted underline underline-offset-4 hover:text-text ${focusRing}`}
        >
          Month plan →
        </Link>
      </div>

      {/* Log card — the one save path, shared with /spend/quick-add */}
      <div
        id="log-spend"
        className="flex scroll-mt-6 flex-col items-center rounded-2xl border-[1.5px] border-border bg-surface"
      >
        <h2 className="mt-4 self-start px-4 font-spend-display text-[1.15rem] font-bold text-text">
          Log a spend
        </h2>
        <QuickAddClient today={today} categories={quickAddCategories} />
      </div>

      {/* Where it went */}
      <div className="flex flex-col gap-3">
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">Where it went</h2>

        {categoryTotals.length === 0 ? (
          <p className="text-text-muted">Nothing logged yet. Your categories will show up here.</p>
        ) : (
          <div>
            {categoryTotals.map(({ cat, total }, i) => {
              const meta = catMeta(cat);
              const share = spent > 0 ? (total / spent) * 100 : 0;
              return (
                <div key={cat} className={`flex flex-col gap-2 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-text">
                      <span>{meta.emoji}</span>
                      <span>{meta.label}</span>
                      <span className="text-text-muted">{Math.round(share)}%</span>
                    </span>
                    <span className="font-bold text-text">{money.format(total)}</span>
                  </div>
                  <div className="h-[6px] overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-text/80" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Every spend this week */}
      <div className="flex flex-col gap-4">
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">Every spend this week</h2>

        {dayKeys.length === 0 ? (
          <p className="text-text-muted">Log your first spend above. Small ones count too.</p>
        ) : (
          dayKeys.map((d) => {
            const items = byDay.get(d)!;
            const dayTotal = items.reduce((s, e) => s + e.amount, 0);
            return (
              <div key={d} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-spend-display font-bold text-text">
                    {d === today ? "Today" : `${weekdayLong(d)}, ${dmon(d)}`}
                  </h3>
                  <span className="font-bold text-text">{money.format(dayTotal)}</span>
                </div>

                <div className="flex flex-col">
                  {items.map((e, i) => (
                    <div
                      key={e.id}
                      className={`flex items-center justify-between gap-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span>{catMeta(e.category).emoji}</span>
                        <div className="min-w-0">
                          <p className="truncate text-text">{e.note || catMeta(e.category).label}</p>
                          {e.note ? (
                            <p className="text-[0.82rem] text-text-muted">{catMeta(e.category).label}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-bold text-text">{money.format(e.amount)}</span>
                        <button
                          type="button"
                          aria-label={`Delete ${e.note || catMeta(e.category).label}, ${money.format(e.amount)}`}
                          onClick={() => handleDelete(e.id)}
                          className={`flex h-[34px] w-[34px] items-center justify-center rounded-full text-text-muted transition-colors hover:text-over ${focusRing}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Import link */}
      <Link
        href="/spend/import"
        className={`self-start text-[0.88rem] text-text-muted underline underline-offset-4 hover:text-text ${focusRing}`}
      >
        Import from Wallet CSV →
      </Link>
    </div>
  );
}
