"use client";

import { useState, useTransition } from "react";
import { decideWaitlist } from "./actions";

export type WaitlistItem = {
  id: string;
  item: string;
  category: string;
  price: number;
  added_at: string;
  decision: "pending" | "bought" | "dropped";
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const focusRing =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal";

const HOURS_48 = 48 * 3_600_000;

function hoursLeft(addedAt: string): number {
  return Math.max(0, HOURS_48 - (Date.now() - new Date(addedAt).getTime())) / 3_600_000;
}

export function WaitlistClient({
  items,
  savedByWaiting,
}: {
  items: WaitlistItem[];
  savedByWaiting: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [decided, setDecided] = useState<Record<string, "bought" | "dropped">>({});
  const [error, setError] = useState<string | null>(null);

  function handleDecide(id: string, decision: "bought" | "dropped") {
    setError(null);
    startTransition(async () => {
      const result = await decideWaitlist({ id, decision });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDecided((prev) => ({ ...prev, [id]: decision }));
    });
  }

  const pending = items.filter((i) => i.decision === "pending" && !decided[i.id]);
  const waiting = pending.filter((i) => hoursLeft(i.added_at) > 0);
  const ready = pending.filter((i) => hoursLeft(i.added_at) === 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border-[1.5px] border-border bg-surface p-4">
        <p className="text-text-muted">Saved by waiting</p>
        <p className="font-spend-display text-[1.6rem] font-bold text-signal">
          {money.format(savedByWaiting)}
        </p>
      </div>

      {error ? <p className="text-[0.88rem] text-over">{error}</p> : null}

      {ready.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-spend-display font-bold text-text">Ready to decide</h2>
          {ready.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-border bg-surface p-4"
            >
              <div>
                <p className="text-text">{i.item}</p>
                <p className="text-[0.85rem] text-text-muted">{money.format(i.price)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-disabled={isPending}
                  onClick={() => handleDecide(i.id, "dropped")}
                  className={`rounded-[10px] border-[1.5px] border-border px-3 py-2 text-[0.85rem] font-bold text-text ${focusRing} aria-disabled:opacity-60`}
                >
                  Drop
                </button>
                <button
                  type="button"
                  aria-disabled={isPending}
                  onClick={() => handleDecide(i.id, "bought")}
                  className={`rounded-[10px] bg-accent px-3 py-2 text-[0.85rem] font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
                >
                  Buy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {waiting.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-spend-display font-bold text-text">Waiting</h2>
          {waiting.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-border bg-surface p-4"
            >
              <div>
                <p className="text-text">{i.item}</p>
                <p className="text-[0.85rem] text-text-muted">{money.format(i.price)}</p>
              </div>
              <p className="text-[0.85rem] text-text-muted">{Math.ceil(hoursLeft(i.added_at))}h left</p>
            </div>
          ))}
        </div>
      )}

      {ready.length === 0 && waiting.length === 0 && (
        <p className="text-text-muted">Nothing on the waitlist right now.</p>
      )}
    </div>
  );
}
