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

import {
  addExpense,
  deleteExpense,
  setWeeklyBudget,
} from "./actions";

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

type Props = {
  weekMon: string;
  currentWeekMon: string;
  today: string;
  budget: number;
  initialExpenses: Expense[];
  weekTotals: { mon: string; total: number }[];
  categories: SpendCategory[];
  monthlyData: { category: string; amount: number }[];
  monthPlanBudgets: Record<string, number>;
};

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

export function SpendClient({
  weekMon,
  currentWeekMon,
  today,
  budget,
  initialExpenses,
  weekTotals,
  categories,
  monthlyData,
  monthPlanBudgets,
}: Props) {
  // First 8 categories (by sort) become pills; the rest go in a "More" select.
  const pillCats = categories.slice(0, 8);
  const moreCats = categories.slice(8);

  function catMeta(key: string) {
    return categories.find((c) => c.key === key) ?? { emoji: "📦", label: key };
  }
  const [expenses, applyOptimistic] = useOptimistic(initialExpenses, reduce);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

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

  // Switching weeks can make the previously-selected day invalid (future, or
  // no longer the obvious default) — reset it, but leave amount/note/category
  // alone since those are mid-entry state the week switch should not discard.
  // Adjusted during render (React's documented pattern for state that must
  // track a prop) rather than in an effect, which would cause an extra render.
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

  // --- Hero numbers -------------------------------------------------------
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = budget - spent;
  const overBudget = remaining < 0;
  const meterPct = Math.min(100, (spent / budget) * 100);

  const heroLabel = overBudget ? "over budget" : isCurrentWeek ? "left this week" : "left that week";

  let sublineTail: string;
  if (isCurrentWeek && !overBudget) {
    const n = daysBetween(today, weekSun) + 1;
    const perDay = remaining / n;
    sublineTail = `${n} ${n === 1 ? "day" : "days"} to go, so about <strong>${money.format(perDay)} a day</strong> keeps you on track.`;
  } else if (isCurrentWeek && overBudget) {
    sublineTail = "Try to keep the rest of the week to essentials only.";
  } else if (overBudget) {
    sublineTail = "This one went over.";
  } else {
    sublineTail = "You stayed under. Nice.";
  }

  // --- Day strip ------------------------------------------------------------
  const dayTotals = days.map((d) => expenses.filter((e) => e.spent_on === d).reduce((s, e) => s + e.amount, 0));
  const pace = budget / 7;
  const maxDay = Math.max(...dayTotals, 0);
  const scale = Math.max(pace * 1.6, maxDay, 1);
  const pacePct = Math.min(100, (pace / scale) * 100);

  // --- Category breakdown -----------------------------------------------
  const categoryTotals = [...expenses
    .reduce<Map<string, number>>((map, e) => {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
      return map;
    }, new Map())
    .entries()]
    .map(([cat, total]) => ({ cat, total }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // --- Monthly view ---------------------------------------------------------
  // Groups that have either spending or a budget in the current month.
  // Subgroup rows (Dating, Guilty pleasure, Clothes) appear indented for
  // groups that define a subgroup structure.
  const groupsForMonth = useMemo(() => {
    // Category totals for the current month
    const byKey = new Map<string, number>();
    for (const r of monthlyData) {
      byKey.set(r.category, (byKey.get(r.category) ?? 0) + r.amount);
    }

    // Group totals
    const byGroup = new Map<string, number>();
    for (const [key, amt] of byKey) {
      const group = categories.find((c) => c.key === key)?.group;
      if (group) byGroup.set(group, (byGroup.get(group) ?? 0) + amt);
    }

    // Groups that have any category with an explicit subgroup → show subrows
    const groupsWithSubs = new Set(
      categories.filter((c) => c.subgroup).map((c) => c.group).filter(Boolean) as string[],
    );

    // Subrow entries (one per category in a group-with-subs that has spending)
    const subsByGroup = new Map<string, { key: string; emoji: string; label: string; subgroup: string | null; total: number }[]>();
    for (const cat of categories) {
      if (!cat.group || !groupsWithSubs.has(cat.group)) continue;
      const total = byKey.get(cat.key) ?? 0;
      if (total === 0) continue;
      const list = subsByGroup.get(cat.group) ?? [];
      list.push({ key: cat.key, emoji: cat.emoji, label: cat.label, subgroup: cat.subgroup, total });
      subsByGroup.set(cat.group, list);
    }

    // Build the group representative (prefer category with no subgroup)
    const repByGroup = new Map<string, SpendCategory>();
    for (const cat of categories) {
      if (!cat.group) continue;
      const existing = repByGroup.get(cat.group);
      if (!existing || cat.subgroup === null) repByGroup.set(cat.group, cat);
    }

    const result = [];
    for (const [group, rep] of repByGroup) {
      const total = byGroup.get(group) ?? 0;
      const planBudget = monthPlanBudgets[group] ?? 0;
      if (total === 0 && planBudget === 0) continue;
      result.push({
        group,
        emoji: rep.emoji,
        kind: rep.kind,
        total,
        budget: planBudget,
        subs: subsByGroup.get(group) ?? [],
      });
    }
    return result.sort((a, b) => b.total - a.total);
  }, [categories, monthlyData, monthPlanBudgets]);

  const [todayY, todayM] = today.split("-").map(Number);
  const monthName = new Date(Date.UTC(todayY, todayM - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    timeZone: "UTC",
  });

  // --- Grouped list ---------------------------------------------------------
  const byDay = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = byDay.get(e.spent_on) ?? [];
    list.push(e);
    byDay.set(e.spent_on, list);
  }
  const dayKeys = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : -1));

  // --- Week nav -------------------------------------------------------------
  const prevWeekHref = `/spend?week=${addDays(weekMon, -7)}`;
  const nextWeekHref = isCurrentWeek ? null : `/spend?week=${addDays(weekMon, 7)}`;
  const weekName = isCurrentWeek ? "This week" : isLastWeek ? "Last week" : `Week of ${dmon(weekMon)}`;

  // --- Budget dialog ----------------------------------------------------
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [budgetInput, setBudgetInput] = useState(String(budget));
  const [budgetError, setBudgetError] = useState<string | null>(null);

  function openBudgetDialog() {
    setBudgetInput(String(budget));
    setBudgetError(null);
    dialogRef.current?.showModal();
  }

  function handleSaveBudget(e: FormEvent) {
    e.preventDefault();
    const amt = Math.round(Number(budgetInput));
    if (!budgetInput || !(amt > 0)) {
      setBudgetError("Enter an amount above zero.");
      return;
    }
    startTransition(async () => {
      const result = await setWeeklyBudget(amt);
      if (result?.error) {
        setBudgetError(result.error);
        return;
      }
      dialogRef.current?.close();
    });
  }

  const navBtn =
    `flex h-[38px] w-[38px] items-center justify-center rounded-full border-[1.5px] border-border text-lg text-text transition-colors hover:border-accent ${focusRing}`;

  const maxWeekTotal = Math.max(...weekTotals.map((w) => w.total), 0);
  const weekBarScale = Math.max(budget, maxWeekTotal, 1);

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={prevWeekHref} aria-label="Previous week" className={navBtn}>
            ‹
          </Link>
          <div>
            <p className="font-spend-display text-[1.05rem] font-bold text-text">
              {weekName}
            </p>
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

        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={openBudgetDialog}
            className={`whitespace-nowrap text-[13px] text-text-muted underline underline-offset-4 hover:text-text ${focusRing}`}
          >
            Budget {money.format(budget)}/wk
          </button>
          <Link
            href="/spend/plan"
            className={`whitespace-nowrap text-[13px] text-text-muted underline underline-offset-4 hover:text-text ${focusRing}`}
          >
            Month plan →
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div aria-live="polite" className="flex flex-col">
        <p
          className={`font-spend-display font-extrabold leading-[0.95] tracking-[-0.03em] text-[clamp(3rem,13vw,5.4rem)] ${
            overBudget ? "text-over" : "text-text"
          }`}
        >
          {money.format(Math.abs(remaining))}
        </p>
        <p className="font-spend-display text-[1.25rem] font-medium text-text">
          {heroLabel}
        </p>
        <p
          className="mt-[10px] max-w-[46ch] text-text-muted"
          dangerouslySetInnerHTML={{
            __html: `<strong>${money.format(spent)}</strong> spent of ${money.format(budget)}. ${sublineTail}`,
          }}
        />

        <div className="mt-4 h-[10px] overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-[width] duration-[400ms] ${overBudget ? "bg-over" : "bg-accent"}`}
            style={{ width: `${meterPct}%` }}
          />
        </div>

        <div className="mt-[22px] grid grid-cols-7 gap-2 max-[420px]:gap-[5px]">
          {days.map((d, i) => {
            const total = dayTotals[i];
            const isToday = d === today;
            const barOver = total > pace;
            const barPct = Math.min(100, (total / scale) * 100);

            return (
              <div key={d} className="flex flex-col items-center gap-1">
                <p className="h-[1em] text-center text-[0.78rem] text-text max-[420px]:text-[0.7rem]">
                  {total > 0 ? money.format(total) : " "}
                </p>
                <div
                  className={`relative w-full rounded-lg bg-border/45 [--col-h:120px] max-[420px]:[--col-h:96px] ${
                    isToday ? "outline outline-2 -outline-offset-2 outline-signal" : ""
                  }`}
                  style={{ height: "var(--col-h)" }}
                >
                  <div
                    className={`absolute inset-x-0 bottom-0 rounded-t-lg transition-[height] duration-[400ms] ${
                      barOver ? "bg-over" : "bg-accent"
                    }`}
                    style={{ height: `calc(var(--col-h) * ${barPct / 100})` }}
                  />
                  <div
                    className="absolute inset-x-0 border-t-2 border-dashed border-text/45"
                    style={{ bottom: `calc(var(--col-h) * ${pacePct / 100})` }}
                  />
                </div>
                <p className={`text-[0.8rem] ${isToday ? "font-bold text-text" : "text-text-muted"}`}>
                  {weekdayShort(d)}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[0.82rem] text-text-muted">Dashed line is your even daily pace.</p>
      </div>

      {/* Log card */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-4"
      >
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">
          Log a spend
        </h2>

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
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">
          Where it went
        </h2>

        {categoryTotals.length === 0 ? (
          <p className="text-text-muted">Nothing logged yet. Your categories will show up here.</p>
        ) : (
          <div>
            {categoryTotals.map(({ cat, total }, i) => {
              const meta = catMeta(cat);
              const share = spent > 0 ? (total / spent) * 100 : 0;
              return (
                <div
                  key={cat}
                  className={`flex flex-col gap-2 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                >
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
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">
          Every spend this week
        </h2>

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
        <h2 className="font-spend-display text-[1.15rem] font-bold text-text">
          Last 8 weeks
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {weekTotals.map(({ mon, total }) => {
            const selected = mon === weekMon;
            const over = total > budget;
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
                  <div
                    className={`absolute inset-x-0 bottom-0 rounded-t-[6px] ${over ? "bg-over" : "bg-accent"}`}
                    style={{ height: `${barPct}%` }}
                  />
                </div>
                <span className={`text-[0.72rem] ${selected ? "font-bold text-text" : "text-text-muted"}`}>
                  {dmon(mon)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* This month */}
      {groupsForMonth.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-spend-display text-[1.15rem] font-bold text-text">
            This month · {monthName}
          </h2>

          <div>
            {groupsForMonth.map(({ group, emoji, kind, total, budget: groupBudget, subs }, i) => {
              const isOver = groupBudget > 0 && total > groupBudget;
              const pct = groupBudget > 0 ? Math.min(100, (total / groupBudget) * 100) : 0;
              return (
                <div
                  key={group}
                  className={`flex flex-col gap-2 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-text">
                      <span>{emoji}</span>
                      <span>{group}</span>
                      {kind === "weekly" && (
                        <span className="rounded bg-border px-1.5 py-0.5 text-[0.72rem] text-text-muted">
                          weekly
                        </span>
                      )}
                    </span>
                    <span className={`font-bold tabular-nums ${isOver ? "text-over" : "text-text"}`}>
                      {groupBudget > 0
                        ? `${money.format(total)} / ${money.format(groupBudget)}`
                        : money.format(total)}
                    </span>
                  </div>

                  {groupBudget > 0 && (
                    <div className="h-[5px] overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full ${isOver ? "bg-over" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  {subs.length > 0 && (
                    <div className="ml-6 flex flex-col gap-1">
                      {subs.map((s) => (
                        <div key={s.key} className="flex items-center justify-between text-[0.88rem]">
                          <span className="flex items-center gap-1.5 text-text-muted">
                            <span>{s.emoji}</span>
                            <span>{s.label}</span>
                          </span>
                          <span className="tabular-nums text-text">{money.format(s.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget dialog */}
      <dialog
        ref={dialogRef}
        className={`m-auto w-[calc(100%-32px)] max-w-[340px] rounded-2xl border-[1.5px] border-border bg-surface p-5 text-text backdrop:bg-black/50`}
      >
        <form onSubmit={handleSaveBudget} className="flex flex-col gap-3">
          <h2 className="font-spend-display text-[1.15rem] font-bold">
            Weekly budget
          </h2>
          <p className="text-[0.9rem] text-text-muted">The most you want to spend Monday to Sunday.</p>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-text-muted">
              ₹
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className={`w-full rounded-lg border-[1.5px] border-border bg-bg py-3 pl-8 pr-3 text-[16px] text-text focus:border-accent ${focusRing}`}
            />
          </div>

          {budgetError ? <p className="text-[0.88rem] text-over">{budgetError}</p> : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={`flex-1 rounded-[10px] border-[1.5px] border-border py-3 text-text ${focusRing}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              aria-disabled={isPending}
              className={`flex-1 rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
              onClick={(e) => { if (isPending) e.preventDefault(); }}
            >
              {isPending ? "Saving…" : "Save budget"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
