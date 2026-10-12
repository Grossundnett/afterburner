"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveMonthPlan } from "./actions";

export type PlanGroup = {
  group: string;
  emoji: string;
  label: string;
};

type Props = {
  month: string;        // YYYY-MM
  monthLabel: string;   // "October 2026"
  salary: number;
  investments: number;
  savings_target: number;
  buffer: number;
  category_budgets: Record<string, number>;
  monthlyGroups: PlanGroup[];
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const focusRing =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal";

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-text">{label}</label>
      <div className="relative w-[140px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-spend-display font-bold text-text-muted">
          ₹
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border-[1.5px] border-border bg-bg py-2 pl-7 pr-3 text-right text-[16px] text-text focus:border-accent ${focusRing}`}
        />
      </div>
    </div>
  );
}

export function PlanClient({
  month,
  monthLabel,
  salary: initSalary,
  investments: initInv,
  savings_target: initSavings,
  buffer: initBuffer,
  category_budgets: initBudgets,
  monthlyGroups,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [salary, setSalary] = useState(initSalary > 0 ? String(initSalary) : "");
  const [investments, setInvestments] = useState(initInv > 0 ? String(initInv) : "");
  const [savingsTarget, setSavingsTarget] = useState(initSavings > 0 ? String(initSavings) : "");
  const [buffer, setBuffer] = useState(initBuffer > 0 ? String(initBuffer) : "");
  const [groupBudgets, setGroupBudgets] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of monthlyGroups) {
      const v = initBudgets[g.group];
      init[g.group] = v && v > 0 ? String(v) : "";
    }
    return init;
  });

  const n = (v: string) => Number(v) || 0;
  const sumMonthly = monthlyGroups.reduce((s, g) => s + n(groupBudgets[g.group] ?? ""), 0);
  const totalOut = n(investments) + n(savingsTarget) + n(buffer) + sumMonthly;
  const available = n(salary) - totalOut;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const categoryBudgets: Record<string, number> = {};
    for (const g of monthlyGroups) {
      const v = n(groupBudgets[g.group] ?? "");
      if (v > 0) categoryBudgets[g.group] = v;
    }

    startTransition(async () => {
      const result = await saveMonthPlan({
        month,
        salary: n(salary),
        investments: n(investments),
        savings_target: n(savingsTarget),
        buffer: n(buffer),
        category_budgets: categoryBudgets,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  const fieldRow = "flex flex-col gap-5 rounded-2xl border-[1.5px] border-border bg-surface p-4";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h1 className="font-spend-display text-[1.3rem] font-bold text-text">{monthLabel}</h1>
        <span className="text-[0.9rem] text-text-muted">month plan</span>
      </div>

      {/* Income */}
      <div className={fieldRow}>
        <h2 className="font-spend-display font-bold text-text">Income</h2>
        <NumInput label="Salary" value={salary} onChange={setSalary} />
      </div>

      {/* Fixed outflows */}
      <div className={fieldRow}>
        <h2 className="font-spend-display font-bold text-text">Fixed outflows</h2>
        <NumInput label="Investments" value={investments} onChange={setInvestments} />
        <NumInput label="Savings target" value={savingsTarget} onChange={setSavingsTarget} />
        <NumInput label="Buffer" value={buffer} onChange={setBuffer} />
      </div>

      {/* Monthly category budgets */}
      <div className={fieldRow}>
        <h2 className="font-spend-display font-bold text-text">Monthly budgets</h2>
        <p className="text-[0.88rem] text-text-muted">
          Any group left blank rolls into Others on the spend page.
        </p>
        {monthlyGroups.map((g) => (
          <NumInput
            key={g.group}
            label={`${g.emoji} ${g.label}`}
            value={groupBudgets[g.group] ?? ""}
            onChange={(v) => setGroupBudgets((prev) => ({ ...prev, [g.group]: v }))}
          />
        ))}
      </div>

      {/* Live summary */}
      <div className="rounded-2xl border-[1.5px] border-border bg-surface p-4">
        <h2 className="font-spend-display font-bold text-text">Summary</h2>
        <div className="mt-3 flex flex-col gap-2 text-[0.9rem]">
          <div className="flex justify-between text-text-muted">
            <span>Salary</span>
            <span>{money.format(n(salary))}</span>
          </div>
          <div className="flex justify-between text-text-muted">
            <span>− Investments</span>
            <span>{money.format(n(investments))}</span>
          </div>
          <div className="flex justify-between text-text-muted">
            <span>− Savings target</span>
            <span>{money.format(n(savingsTarget))}</span>
          </div>
          <div className="flex justify-between text-text-muted">
            <span>− Buffer</span>
            <span>{money.format(n(buffer))}</span>
          </div>
          <div className="flex justify-between text-text-muted">
            <span>− Monthly budgets</span>
            <span>{money.format(sumMonthly)}</span>
          </div>
          <div
            className={`mt-1 flex justify-between border-t border-border pt-2 font-bold ${
              available < 0 ? "text-over" : "text-text"
            }`}
          >
            <span>Available for weekly spend</span>
            <span>{money.format(available)}</span>
          </div>
        </div>
      </div>

      {error ? <p className="text-[0.88rem] text-over">{error}</p> : null}
      {saved ? (
        <p className="text-[0.88rem] text-signal">Plan saved.</p>
      ) : null}

      <button
        type="submit"
        aria-disabled={isPending}
        className={`w-full rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
        onClick={(e) => { if (isPending) e.preventDefault(); }}
      >
        {isPending ? "Saving…" : "Save plan"}
      </button>
    </form>
  );
}
