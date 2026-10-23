"use client";

import { useState, useTransition } from "react";
import { addExpense } from "../actions";

export type QuickCategory = { key: string; label: string; emoji: string };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const focusRing =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** Amount-first, numeric-keypad entry rather than a bare <input type=number>
 * — some Android keyboards substitute a locale's own digit glyphs or decimal
 * separator into a numeric input, which silently breaks parseMoney on a
 * phone whose keyboard language isn't English. A keypad built from plain
 * button presses has no locale to get wrong. */
export function QuickAddClient({ today, categories }: { today: string; categories: QuickCategory[] }) {
  const [digits, setDigits] = useState("");
  const [category, setCategory] = useState<string>(categories[0]?.key ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const amount = digits === "" ? 0 : Number(digits) / 100;

  function press(key: string) {
    setDone(false);
    if (key === "⌫") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (key === "") return;
    setDigits((d) => (d.length >= 9 ? d : d + key));
  }

  function handleSubmit() {
    setError(null);
    if (!(amount > 0)) {
      setError("Enter an amount above zero.");
      return;
    }
    if (!category) {
      setError("Pick a category.");
      return;
    }
    startTransition(async () => {
      const result = await addExpense({
        amount,
        category,
        note: null,
        spentOn: today,
        account: "Apex",
        emotion: null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDigits("");
      setDone(true);
    });
  }

  return (
    <div className="flex w-full max-w-[380px] flex-col items-center gap-5 px-[18px] py-8">
      <p className="font-spend-display text-[clamp(2.5rem,16vw,3.5rem)] font-extrabold tabular-nums text-text">
        {money.format(amount)}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {categories.map((c) => {
          const selected = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={selected}
              onClick={() => { setCategory(c.key); setDone(false); }}
              className={`rounded-full border-[1.5px] px-3 py-1.5 text-[0.9rem] transition-colors ${focusRing} ${
                selected ? "border-text bg-text text-bg" : "border-border text-text hover:border-accent"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        {KEYS.map((key, i) => (
          <button
            key={i}
            type="button"
            disabled={key === ""}
            onClick={() => press(key)}
            className={`rounded-xl border-[1.5px] border-border py-4 font-spend-display text-[1.4rem] font-bold text-text ${focusRing} ${
              key === "" ? "invisible" : "hover:border-accent"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {error ? <p className="text-[0.88rem] text-over">{error}</p> : null}
      {done ? <p className="text-[0.88rem] text-signal">Added.</p> : null}

      <button
        type="button"
        aria-disabled={isPending}
        onClick={handleSubmit}
        className={`w-full rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
      >
        {isPending ? "Adding…" : `Add ${money.format(amount)}`}
      </button>
    </div>
  );
}
