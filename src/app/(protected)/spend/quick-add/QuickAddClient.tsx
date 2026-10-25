"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { addExpense } from "../actions";
import { addToWaitlist } from "../waitlist/actions";

// Paise digits; 8 caps the typed amount at ₹9,99,999 (a rupee amount this
// app's categories have no legitimate reason to exceed). Rejected taps at
// the cap must be visible — silently dropping them is indistinguishable
// from a tap that simply didn't register, which is its own bug class.
const MAX_DIGITS = 8;

export type QuickCategory = { key: string; label: string; emoji: string; group: string | null };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const focusRing =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

const EMOTIONS = ["bored", "lonely", "celebrating", "punishing"] as const;
type Emotion = (typeof EMOTIONS)[number];

// Any Subscriptions amount, or Fun/Big Buy over ₹1,500, offers the waitlist
// instead of an immediate save. Night mode (22:00–06:00 IST) prompts the
// same choice for Fun/Subscriptions, regardless of amount. Both are
// pre-submit interrupts, not a server-side block — a backfill of something
// already decided elsewhere still goes straight through addExpense.
const WAITLIST_GROUPS = new Set(["Fun", "Subscriptions", "Big Buy"]);

function isNightIST(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(
      new Date(),
    ),
  );
  return hour >= 22 || hour < 6;
}

/** Amount-first, numeric-keypad entry rather than a bare <input type=number>
 * — some Android keyboards substitute a locale's own digit glyphs or decimal
 * separator into a numeric input, which silently breaks parseMoney on a
 * phone whose keyboard language isn't English. A keypad built from plain
 * button presses has no locale to get wrong.
 *
 * This is the one save path for every spend — `/spend` embeds this same
 * component rather than a separate form, so night mode, the waitlist gate
 * and the emotion picker only need to exist in one place. */
export function QuickAddClient({ today, categories }: { today: string; categories: QuickCategory[] }) {
  const [digits, setDigits] = useState("");
  const [category, setCategory] = useState<string>(categories[0]?.key ?? "");
  const [note, setNote] = useState("");
  const [emotion, setEmotion] = useState<Emotion | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [interrupt, setInterrupt] = useState<"threshold" | "night" | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlisted, setWaitlisted] = useState(false);

  // Until this flips true, the keypad is visibly dimmed and disabled
  // rather than silently ignoring early taps that land before hydration
  // finishes — a tap that does nothing and a tap that isn't possible yet
  // must not look the same.
  const [mounted, setMounted] = useState(false);
  // There is no render-time way to know the client has hydrated — that's
  // what this effect firing once *is* — so this is the one case the
  // "don't mirror a prop into state" lint rule can't distinguish from the
  // anti-pattern it exists to catch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Tapping a digit at the cap shakes the amount instead of being dropped.
  // shakeKey forces the shake element to remount on every rejected tap (not
  // just the first), since re-applying the same class name to an element
  // that's already mid-animation does not restart a CSS animation.
  const [atMax, setAtMax] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const amount = digits === "" ? 0 : Number(digits) / 100;
  const selectedGroup = categories.find((c) => c.key === category)?.group ?? null;
  const showEmotionPicker = selectedGroup === "Fun" || selectedGroup === "Big Buy";

  function press(key: string) {
    setDone(false);
    if (key === "⌫") {
      setAtMax(false);
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (key === "") return;
    if (digits.length >= MAX_DIGITS) {
      setAtMax(true);
      setShakeKey((k) => k + 1);
      return;
    }
    setAtMax(false);
    setDigits((d) => d + key);
  }

  function runSave() {
    startTransition(async () => {
      const result = await addExpense({
        amount,
        category,
        note: note.trim() || null,
        spentOn: today,
        account: "Apex",
        emotion: showEmotionPicker ? emotion : null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDigits("");
      setNote("");
      setEmotion(null);
      setInterrupt(null);
      setDone(true);
    });
  }

  function handleSubmit(force = false) {
    setError(null);
    if (!(amount > 0)) {
      setError("Enter an amount above zero.");
      return;
    }
    if (!category) {
      setError("Pick a category.");
      return;
    }

    if (!force) {
      const overThreshold = WAITLIST_GROUPS.has(selectedGroup ?? "") && amount > 1500;
      const isSubscription = selectedGroup === "Subscriptions";
      if (overThreshold || isSubscription) {
        setInterrupt("threshold");
        return;
      }
      if ((selectedGroup === "Fun" || selectedGroup === "Subscriptions") && isNightIST()) {
        setInterrupt("night");
        return;
      }
    }

    runSave();
  }

  function handleWaitlistInstead() {
    setWaitlistError(null);
    const cat = categories.find((c) => c.key === category);
    startTransition(async () => {
      const result = await addToWaitlist({
        item: note.trim() || cat?.label || category,
        category,
        price: amount,
      });
      if (result?.error) {
        setWaitlistError(result.error);
        return;
      }
      setDigits("");
      setNote("");
      setEmotion(null);
      setInterrupt(null);
      setWaitlisted(true);
    });
  }

  return (
    <div
      className={`flex w-full max-w-[380px] flex-col items-center gap-5 px-[18px] py-8 transition-opacity ${
        mounted ? "" : "opacity-50"
      }`}
    >
      <div key={shakeKey} className={atMax ? "shake" : undefined}>
        <p className="font-spend-display text-[clamp(2.5rem,16vw,3.5rem)] font-extrabold tabular-nums text-text">
          {money.format(amount)}
        </p>
      </div>
      {atMax ? <p className="text-[0.85rem] font-bold text-over">Max ₹9,99,999</p> : null}

      <div className="flex flex-wrap justify-center gap-2">
        {categories.map((c) => {
          const selected = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              disabled={!mounted}
              aria-pressed={selected}
              onClick={() => { setCategory(c.key); setEmotion(null); setInterrupt(null); setDone(false); }}
              className={`rounded-full border-[1.5px] px-3 py-1.5 text-[0.9rem] transition-colors ${focusRing} ${
                selected ? "border-text bg-text text-bg" : "border-border text-text hover:border-accent"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          );
        })}
      </div>

      {showEmotionPicker && (
        <div className="flex flex-wrap justify-center gap-2">
          {EMOTIONS.map((e) => {
            const selected = emotion === e;
            return (
              <button
                key={e}
                type="button"
                disabled={!mounted}
                aria-pressed={selected}
                onClick={() => setEmotion(selected ? null : e)}
                className={`rounded-full border-[1.5px] px-3 py-1.5 text-[0.82rem] capitalize transition-colors ${focusRing} ${
                  selected ? "border-text bg-text text-bg" : "border-border text-text-muted hover:border-accent"
                }`}
              >
                {e}
              </button>
            );
          })}
        </div>
      )}

      <input
        type="text"
        maxLength={300}
        placeholder="What was it? (optional)"
        value={note}
        disabled={!mounted}
        onChange={(e) => setNote(e.target.value)}
        className={`w-full rounded-lg border-[1.5px] border-border bg-bg px-3 py-2.5 text-[16px] text-text focus:border-accent disabled:opacity-60 ${focusRing}`}
      />

      <div className="grid w-full grid-cols-3 gap-2">
        {KEYS.map((key, i) => (
          <button
            key={i}
            type="button"
            disabled={key === "" || !mounted}
            aria-label={key === "⌫" ? "Backspace" : undefined}
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
      {waitlistError ? <p className="text-[0.88rem] text-over">{waitlistError}</p> : null}
      {done ? <p className="text-[0.88rem] text-signal">Added.</p> : null}
      {waitlisted ? (
        <p className="text-[0.88rem] text-signal">
          Added to the waitlist.{" "}
          <Link href="/spend/waitlist" className="underline underline-offset-4">
            View it →
          </Link>
        </p>
      ) : null}

      {interrupt ? (
        <div className="flex w-full flex-col gap-2 rounded-lg border-[1.5px] border-signal/50 p-3">
          <p className="text-[0.9rem] text-text">
            {interrupt === "threshold"
              ? "Subscriptions, and anything over ₹1,500 in Fun or Big Buy, get a 48-hour pause before they count."
              : "It's late. Is this the \"punish myself\" kind? Waitlist it?"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!mounted}
              aria-disabled={isPending}
              onClick={handleWaitlistInstead}
              className={`flex-1 rounded-[10px] bg-accent py-2.5 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
            >
              Waitlist it
            </button>
            <button
              type="button"
              disabled={!mounted}
              aria-disabled={isPending}
              onClick={() => handleSubmit(true)}
              className={`flex-1 rounded-[10px] border-[1.5px] border-border py-2.5 font-bold text-text ${focusRing} aria-disabled:opacity-60`}
            >
              Log it anyway
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!mounted}
          aria-disabled={isPending}
          onClick={() => handleSubmit(false)}
          className={`w-full rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
        >
          {isPending ? "Adding…" : `Add ${money.format(amount)}`}
        </button>
      )}
    </div>
  );
}
