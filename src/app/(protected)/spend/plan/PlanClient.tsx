"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ACCOUNTS } from "@/lib/accounts";
import { parseMoney } from "@/lib/money";
import { cycleBoundsForMonth, cycleWeightTotal } from "@/lib/dates";
import { CATEGORY_SUB_LABELS } from "@/lib/spend-categories";
import { saveMonthPlan, recordBalance, setCountBobAsCash } from "./actions";

const SHOPPING_SUB_LABELS = CATEGORY_SUB_LABELS["Shopping"];

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
  shopping_accrual: number;
  category_budgets: Record<string, number>;
  weeklyGroups: PlanGroup[];
  monthlyGroups: PlanGroup[];
  balances: Record<string, number>;
  countBobAsCash: boolean;
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
  indent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${indent ? "ml-5" : ""}`}>
      <label className={indent ? "text-[0.9rem] text-text-muted" : "text-text"}>{label}</label>
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
  shopping_accrual: initShoppingAccrual,
  category_budgets: initBudgets,
  weeklyGroups,
  monthlyGroups,
  balances,
  countBobAsCash: initCountBob,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [salary, setSalary] = useState(initSalary > 0 ? String(initSalary) : "");
  const [investments, setInvestments] = useState(initInv > 0 ? String(initInv) : "");
  const [savingsTarget, setSavingsTarget] = useState(initSavings > 0 ? String(initSavings) : "");
  const [shoppingAccrual, setShoppingAccrual] = useState(
    initShoppingAccrual > 0 ? String(initShoppingAccrual) : "",
  );
  // Shopping has no flat budget of its own — only its four sub-budgets,
  // which must sum to shoppingAccrual (checked live below, enforced again
  // server-side in saveMonthPlan).
  const [shoppingSub, setShoppingSub] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const label of SHOPPING_SUB_LABELS) {
      const v = initBudgets[`Shopping:${label}`];
      init[label] = v && v > 0 ? String(v) : "";
    }
    return init;
  });
  const [groupBudgets, setGroupBudgets] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of [...weeklyGroups, ...monthlyGroups]) {
      if (g.group === "Shopping") continue;
      const v = initBudgets[g.group];
      init[g.group] = v && v > 0 ? String(v) : "";
    }
    return init;
  });

  const n = parseMoney;

  // The discretionary cap is what funds the day-weighted allowance in
  // get_dashboard() — it's salary minus the automatic sweeps only. The six
  // bucket budgets are a separate, advisory split of that cap; they don't
  // subtract from it, so "Unassigned" is a check, not an identity.
  const discretionaryCap = n(salary) - n(investments) - n(savingsTarget) - n(shoppingAccrual);

  // "Unassigned" is cap minus what the five in-cap category budgets
  // actually add up to over the whole cycle — Shopping is never in-cap
  // (it's funded by the accrual into its own fund), same whether this
  // cycle happens to still be running under October's old mechanics or
  // November's new ones; this editor only ever writes Shopping as
  // sub-budgets, so there's no flat "Shopping" figure left to add here.
  // Food/Transport are weekly rates, and every week's own Food/Transport
  // bar is scaled by that week's share of Mom's rule's day-weight mass
  // (_spend_weekly_rate_budget) — so their cycle total is weeklyRate/7 ×
  // the cycle's whole weight mass, NOT weeklyRate × plain calendar weeks.
  const { start: cycleStart, end: cycleEnd } = cycleBoundsForMonth(month);
  const weightTotal = cycleWeightTotal(cycleStart, cycleEnd);
  const food = n(groupBudgets["Food"] ?? "");
  const transport = n(groupBudgets["Transport"] ?? "");
  const fun = n(groupBudgets["Fun"] ?? "");
  const subscriptions = n(groupBudgets["Subscriptions"] ?? "");
  const other = n(groupBudgets["Other"] ?? "");
  const incapTotal = ((food + transport) / 7) * weightTotal + fun + subscriptions + other;
  const unassigned = discretionaryCap - incapTotal;

  const shoppingSubTotal = SHOPPING_SUB_LABELS.reduce((sum, label) => sum + n(shoppingSub[label] ?? ""), 0);
  const shoppingGap = Math.round((n(shoppingAccrual) - shoppingSubTotal) * 100) / 100;
  const shoppingMismatch = Math.abs(shoppingGap) > 0.01;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (shoppingMismatch) {
      setError(
        shoppingGap > 0
          ? `Shopping's sub-budgets are ${money.format(shoppingGap)} short of the accrual.`
          : `Shopping's sub-budgets are ${money.format(Math.abs(shoppingGap))} over the accrual.`,
      );
      return;
    }

    const categoryBudgets: Record<string, number> = {};
    for (const g of [...weeklyGroups, ...monthlyGroups]) {
      if (g.group === "Shopping") continue;
      const v = n(groupBudgets[g.group] ?? "");
      if (v > 0) categoryBudgets[g.group] = v;
    }
    for (const label of SHOPPING_SUB_LABELS) {
      const v = n(shoppingSub[label] ?? "");
      if (v > 0) categoryBudgets[`Shopping:${label}`] = v;
    }

    startTransition(async () => {
      const result = await saveMonthPlan({
        month,
        salary: n(salary),
        investments: n(investments),
        savings_target: n(savingsTarget),
        shopping_accrual: n(shoppingAccrual),
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
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between">
          <h1 className="glow-text font-spend-display text-[1.3rem] font-bold text-text">{monthLabel}</h1>
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
          <NumInput
            label="Shopping accrual/month"
            value={shoppingAccrual}
            onChange={setShoppingAccrual}
          />
          <div className="flex justify-between border-t border-border pt-3 text-[0.9rem] font-bold text-text">
            <span>Discretionary cap this cycle</span>
            <span className="tabular-nums">{money.format(discretionaryCap)}</span>
          </div>
        </div>

        {/* Weekly budgets (per week — reset every Monday) */}
        <div className={fieldRow}>
          <h2 className="font-spend-display font-bold text-text">Weekly budgets</h2>
          <p className="text-[0.88rem] text-text-muted">
            Per week. The spend page applies Mom&apos;s rule: 0.8× in days 1-14 of the
            cycle, 1.2× from day 15.
          </p>
          {weeklyGroups.map((g) => (
            <NumInput
              key={g.group}
              label={`${g.emoji} ${g.label}`}
              value={groupBudgets[g.group] ?? ""}
              onChange={(v) => setGroupBudgets((prev) => ({ ...prev, [g.group]: v }))}
            />
          ))}
        </div>

        {/* Monthly category budgets */}
        <div className={fieldRow}>
          <h2 className="font-spend-display font-bold text-text">Monthly budgets</h2>
          <p className="text-[0.88rem] text-text-muted">
            Any bucket left blank still tracks spend, just with no bar to compare it to.
          </p>
          {monthlyGroups
            .filter((g) => g.group !== "Shopping")
            .map((g) => (
              <NumInput
                key={g.group}
                label={`${g.emoji} ${g.label}`}
                value={groupBudgets[g.group] ?? ""}
                onChange={(v) => setGroupBudgets((prev) => ({ ...prev, [g.group]: v }))}
              />
            ))}
        </div>

        {/* Shopping — no flat budget of its own, only its four sub-budgets,
            which must sum to the accrual above (checked live, enforced
            again server-side). */}
        <div className={fieldRow}>
          <h2 className="font-spend-display font-bold text-text">🛍️ Shopping sub-budgets</h2>
          <p className="text-[0.88rem] text-text-muted">
            Split the accrual across these four — they must add up to it exactly.
          </p>
          {SHOPPING_SUB_LABELS.map((label) => (
            <NumInput
              key={label}
              label={label}
              value={shoppingSub[label] ?? ""}
              onChange={(v) => setShoppingSub((prev) => ({ ...prev, [label]: v }))}
            />
          ))}
          <div
            className={`flex justify-between border-t border-border pt-3 text-[0.9rem] font-bold tabular-nums ${
              shoppingMismatch ? "text-over" : "text-text"
            }`}
          >
            <span>Sub-budgets total</span>
            <span>{money.format(shoppingSubTotal)}</span>
          </div>
          {shoppingMismatch && (
            <p className="text-[0.85rem] text-over">
              {shoppingGap > 0
                ? `${money.format(shoppingGap)} short of the accrual.`
                : `${money.format(Math.abs(shoppingGap))} over the accrual.`}
            </p>
          )}
        </div>

        {/* Live summary */}
        <div className="rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <h2 className="font-spend-display font-bold text-text">Summary</h2>
          <div className="mt-3 flex flex-col gap-2 text-[0.9rem] tabular-nums">
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
              <span>− Shopping accrual</span>
              <span>{money.format(n(shoppingAccrual))}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-2 font-bold text-text">
              <span>Discretionary cap</span>
              <span>{money.format(discretionaryCap)}</span>
            </div>
            <div className="flex justify-between text-text-muted">
              <span>Unassigned</span>
              <span className={unassigned < 0 ? "text-over" : ""}>{money.format(unassigned)}</span>
            </div>
          </div>
        </div>

        {error ? <p className="text-[0.88rem] text-over">{error}</p> : null}
        {saved ? <p className="text-[0.88rem] text-signal">Plan saved.</p> : null}

        <button
          type="submit"
          aria-disabled={isPending}
          className={`w-full rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
          onClick={(e) => { if (isPending) e.preventDefault(); }}
        >
          {isPending ? "Saving…" : "Save plan"}
        </button>
      </form>

      <BalancesCard balances={balances} countBobAsCash={initCountBob} />
    </div>
  );
}

function BalancesCard({
  balances,
  countBobAsCash,
}: {
  balances: Record<string, number>;
  countBobAsCash: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [countBob, setCountBob] = useState(countBobAsCash);
  const [error, setError] = useState<string | null>(null);

  function save(account: (typeof ACCOUNTS)[number]) {
    const raw = inputs[account] ?? "";
    const amt = parseMoney(raw);
    if (!raw.trim() || !(amt >= 0)) {
      setError("Enter an amount of zero or more.");
      return;
    }
    setError(null);
    setConfirmation(null);
    startTransition(async () => {
      const result = await recordBalance({ account, amount: amt });
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      // en-IN's default hourCycle is h11 (0-11), which renders noon/midnight
      // hours as "0:15 pm" instead of "12:15 pm" — hourCycle must be forced
      // to h12 (1-12). timeZone is explicit too, so this reads correctly
      // regardless of the browser's own clock.
      const at = new Date(result.snapshot_at).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hourCycle: "h12",
        hour: "2-digit",
        minute: "2-digit",
      });
      setConfirmation(`Saved ${result.account} ${money.format(result.amount)} at ${at}`);
      setInputs((prev) => ({ ...prev, [account]: "" }));
    });
  }

  function toggleCountBob(checked: boolean) {
    setCountBob(checked);
    startTransition(async () => {
      const result = await setCountBobAsCash(checked);
      if (result?.error) {
        setError(result.error);
        setCountBob(!checked); // revert the optimistic flip, it didn't actually save
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-4">
      <h2 className="font-spend-display font-bold text-text">Balances</h2>
      <p className="text-[0.88rem] text-text-muted">
        A snapshot, not a running total — logging a spend lowers it automatically
        until you correct drift with a fresh number here.
      </p>

      {ACCOUNTS.map((account) => (
        <div key={account} className="flex items-center justify-between gap-3">
          <div>
            <label className="text-text">{account}</label>
            {balances[account] != null && (
              <p className="text-[0.78rem] tabular-nums text-text-muted">
                last recorded {money.format(balances[account])}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-[120px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-text-muted">
                ₹
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={inputs[account] ?? ""}
                onChange={(e) => {
                  setInputs((prev) => ({ ...prev, [account]: e.target.value }));
                  setConfirmation(null);
                }}
                className={`w-full rounded-lg border-[1.5px] border-border bg-bg py-2 pl-7 pr-3 text-right text-[16px] text-text focus:border-accent ${focusRing}`}
              />
            </div>
            <button
              type="button"
              aria-disabled={isPending}
              onClick={(e) => { if (isPending) { e.preventDefault(); return; } save(account); }}
              className={`rounded-lg border-[1.5px] border-border px-3 py-2 text-[0.85rem] text-text hover:border-accent ${focusRing} aria-disabled:opacity-60`}
            >
              {isPending ? "Saving…" : "Update"}
            </button>
          </div>
        </div>
      ))}

      {error ? <p className="text-[0.88rem] text-over">{error}</p> : null}
      {confirmation ? <p className="text-[0.88rem] font-bold tabular-nums text-signal">{confirmation}</p> : null}

      <label className="flex items-center gap-2 border-t border-border pt-3 text-[0.88rem] text-text-muted">
        <input
          type="checkbox"
          checked={countBob}
          onChange={(e) => toggleCountBob(e.target.checked)}
          className="h-4 w-4"
        />
        Count BOB&apos;s spendable remainder as real money left (off once the
        weekly Apex transfer habit is established)
      </label>
    </div>
  );
}
