"use client";

import Link from "next/link";
import {
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { addDays, daysBetween } from "@/lib/dates";

import { addExpense, coverOverspend, deleteExpense } from "./actions";

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
  kind: "weekly" | "monthly";
  late_tax: { budget: number; spent: number; over: boolean } | null;
};

export type Dashboard =
  | { has_plan: false; cycle_start: string; cycle_end: string }
  | {
      has_plan: true;
      cycle_start: string;
      cycle_end: string;
      discretionary_cap: number;
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
  weekTotals: { mon: string; total: number }[];
  categories: SpendCategory[];
  dashboard: Dashboard;
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
const weekdayShort = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(dateParts(iso));
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
}: {
  emoji: string;
  label: string;
  total: number;
  budget: number;
  pace?: number;
  sub?: { label: string; spent: number; budget: number; over: boolean } | null;
}) {
  const pct = budget > 0 ? (total / budget) * 100 : 0;
  const isOver = pct > 100;
  const pacePct = pace != null && budget > 0 ? Math.min(100, (pace / budget) * 100) : null;
  const aheadOfPace = !isOver && pacePct != null && pct > pacePct + 0.5;
  const basePct = Math.min(100, pct) / BAR_SCALE;
  const overflowPct = isOver ? Math.min(50, pct - 100) / BAR_SCALE : 0;
  const delta = Math.abs(budget - total);
  const sideLabel =
    budget === 0 ? "no budget" : isOver ? `${money.format(delta)} over` : `${money.format(delta)} left`;

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
  weekTotals,
  categories,
  dashboard,
}: Props) {
  const pillCats = categories.slice(0, 8);
  const moreCats = categories.slice(8);

  function catMeta(key: string) {
    return categories.find((c) => c.key === key) ?? { emoji: "📦", label: key };
  }
  const [expenses, applyOptimistic] = useOptimistic(initialExpenses, reduce);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveDone, setMoveDone] = useState(false);

  const weekSun = addDays(weekMon, 6);
  const isCurrentWeek = weekMon === currentWeekMon;
  const isLastWeek = weekMon === addDays(currentWeekMon, -7);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekMon, i)), [weekMon]);
  const allowedDays = useMemo(() => days.filter((d) => d <= today), [days, today]);
  const defaultDay = allowedDays.includes(today) ? today : allowedDays[allowedDays.length - 1] ?? weekMon;

  // --- Log form state ---------------------------------------------------
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<string>(categories[0]?.key ?? "");
  const [day, setDay] = useState(defaultDay);
  const amountRef = useRef<HTMLInputElement>(null);

  const [trackedWeekMon, setTrackedWeekMon] = useState(weekMon);
  if (weekMon !== trackedWeekMon) {
    setTrackedWeekMon(weekMon);
    setDay(defaultDay);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const amt = Number(amount);
    if (!amount || !(amt > 0)) {
      setFormError("Enter an amount above zero.");
      return;
    }

    const trimmedNote = note.trim();
    const optimisticExpense: Expense = {
      id: crypto.randomUUID(),
      amount: Math.round(amt * 100) / 100,
      category,
      note: trimmedNote || null,
      spent_on: day,
      created_at: new Date().toISOString(),
    };

    startTransition(async () => {
      applyOptimistic({ type: "add", expense: optimisticExpense });
      const result = await addExpense({
        amount: amt,
        category,
        note: trimmedNote || null,
        spentOn: day,
      });

      if (result?.error) {
        setFormError(result.error);
        return;
      }

      setAmount("");
      setNote("");
      amountRef.current?.focus();
    });
  }

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
        over: c.spent - c.budget,
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
  const mover = useMemo(() => {
    if (!dashboard.has_plan) return null;
    const overs = bucketRows.filter((r) => r.over > 0);
    if (overs.length === 0) return null;
    const worst = overs[0];
    const donors = bucketRows
      .filter((r) => r.bucket !== worst.bucket && r.budget - r.total > 0)
      .sort((a, b) => (b.budget - b.total) - (a.budget - a.total));
    if (donors.length === 0) return null;
    const donor = donors[0];
    const donorRoom = donor.budget - donor.total;
    const moveAmt = Math.round(Math.min(worst.over, donorRoom));
    if (moveAmt <= 0) return null;
    return { worst, donor, donorRoom, moveAmt };
  }, [dashboard, bucketRows]);

  function handleCover() {
    if (!mover) return;
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

  const maxWeekTotal = Math.max(...weekTotals.map((w) => w.total), 0);
  const weekBarScale = Math.max(maxWeekTotal, 1);

  // --- Hero ----------------------------------------------------------------
  const currentWeekSun = addDays(currentWeekMon, 6);
  const daysLeftInWeek = daysBetween(today, currentWeekSun) + 1;

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

      {/* This week's move */}
      {dashboard.has_plan && mover && !moveDone && (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-signal/50 bg-surface p-4">
          <p className="text-text">
            <strong>{mover.worst.bucket}</strong> is {money.format(mover.worst.over)} over. Cover it from{" "}
            <strong>{mover.donor.bucket}</strong> ({money.format(mover.donorRoom)} left)?
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
            />
          ))}
        </div>
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

      {/* Log card */}
      <form
        id="log-spend"
        onSubmit={handleSubmit}
        className="flex scroll-mt-6 flex-col gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-4"
      >
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">Log a spend</h2>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-spend-display text-[1.5rem] font-bold text-text-muted">
              ₹
            </span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`w-full rounded-lg border-[1.5px] border-border bg-bg py-3 pl-8 pr-3 font-spend-display text-[1.5rem] font-bold text-text focus:border-accent ${focusRing}`}
            />
          </div>

          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className={`rounded-lg border-[1.5px] border-border bg-bg px-3 text-[16px] text-text ${focusRing}`}
          >
            {days.map((d) => (
              <option key={d} value={d} disabled={d > today}>
                {d === today ? "Today" : `${weekdayShort(d)} ${dmon(d)}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {pillCats.map((cat) => {
            const selected = category === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(cat.key)}
                className={`rounded-full border-[1.5px] px-3 py-1.5 text-[0.9rem] transition-colors ${focusRing} ${
                  selected ? "border-text bg-text text-bg" : "border-border text-text hover:border-accent"
                }`}
              >
                {cat.emoji} {cat.label}
              </button>
            );
          })}
          {moreCats.length > 0 && (
            <select
              value={moreCats.some((c) => c.key === category) ? category : ""}
              onChange={(e) => { if (e.target.value) setCategory(e.target.value); }}
              className={`rounded-full border-[1.5px] px-3 py-1.5 text-[0.9rem] transition-colors ${focusRing} ${
                moreCats.some((c) => c.key === category)
                  ? "border-text bg-text text-bg"
                  : "border-border bg-bg text-text hover:border-accent"
              }`}
            >
              <option value="">More…</option>
              {moreCats.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.emoji} {cat.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <input
          type="text"
          maxLength={300}
          placeholder="What was it? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`w-full rounded-lg border-[1.5px] border-border bg-bg px-3 py-3 text-[16px] text-text focus:border-accent ${focusRing}`}
        />

        {formError ? <p className="text-[0.88rem] text-over">{formError}</p> : null}

        <button
          type="submit"
          aria-disabled={isPending}
          className={`w-full rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
          onClick={(e) => { if (isPending) e.preventDefault(); }}
        >
          {isPending ? "Adding…" : "Add spend"}
        </button>
      </form>

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

      {/* Last 8 weeks */}
      <div className="flex flex-col gap-3">
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">Last 8 weeks</h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {weekTotals.map(({ mon, total }) => {
            const selected = mon === weekMon;
            const barPct = Math.min(100, (total / weekBarScale) * 100);
            return (
              <Link
                key={mon}
                href={`/spend?week=${mon}`}
                className={`flex h-[110px] w-[64px] shrink-0 flex-col items-center justify-end gap-1 rounded-sm ${focusRing} ${
                  selected ? "outline outline-2 -outline-offset-2 outline-signal" : ""
                }`}
              >
                <span className={`text-[0.72rem] ${selected ? "font-bold text-text" : "text-text-muted"}`}>
                  {money.format(total)}
                </span>
                <div className="relative w-full flex-1">
                  <div className="absolute inset-x-0 bottom-0 rounded-t-[6px] bg-accent" style={{ height: `${barPct}%` }} />
                </div>
                <span className={`text-[0.72rem] ${selected ? "font-bold text-text" : "text-text-muted"}`}>
                  {dmon(mon)}
                </span>
              </Link>
            );
          })}
        </div>
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
