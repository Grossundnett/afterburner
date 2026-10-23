"use client";

/**
 * /theme-preview — public, no auth, no DB reads, sample data only.
 *
 * A single page showing the Tron: Ares direction (theme round, AGENTS.md)
 * against fabricated data, so it can be approved on a phone before the
 * tokens are rolled out across every real page (chunk C2). Delete this
 * route once approved — it exists only to be looked at, not used.
 */

import { useState } from "react";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import { ContributionGrid } from "@/components/contribution-grid";
import { sportAccent } from "@/lib/sport-color";

// Loaded here (rather than relying on /spend's own layout, which this
// public preview page sits outside of) so the spend-side section below can
// use the same display/body fonts the real /spend route does.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-bricolage" });
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson" });

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const focusRing =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal";

// ---- fabricated sample data, no DB involved -------------------------------

const TODAY = "2026-10-23";

function sampleGridData() {
  const minutesByDate = new Map<string, number>();
  const activeDates = new Set<string>();
  const loggedDates = new Set<string>();
  const blockedDates = new Set<string>();
  const start = new Date("2026-07-24T00:00:00Z");
  for (let i = 0; i < 91; i++) {
    const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const r = (i * 37) % 11;
    if (r < 1) continue; // not logged
    loggedDates.add(d);
    if (r < 3) {
      blockedDates.add(d);
    } else if (r < 4) {
      // rest day: logged, no activity
    } else {
      activeDates.add(d);
      minutesByDate.set(d, [20, 35, 50, 70, 90][r % 5]);
    }
  }
  return { minutesByDate, activeDates, loggedDates, blockedDates };
}

const KNOWN_SPORTS = [
  { slug: "run", label: "Run" },
  { slug: "cycling", label: "Cycling" },
  { slug: "swim", label: "Swim" },
  { slug: "gym", label: "Gym" },
  { slug: "body", label: "Body" },
  { slug: "discipline", label: "Discipline" },
] as const;

const CUSTOM_SPORT = { slug: "climbing", label: "Climbing" };

const BAR_DEMOS = [
  { label: "Food", total: 4200, budget: 7500, pace: 4600, state: "ahead" as const },
  { label: "Subscriptions", total: 980, budget: 1000, pace: 500, state: "pace" as const },
  { label: "Transport", total: 4495, budget: 3600, pace: 3600, state: "over" as const },
];

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
const CHIPS = [
  { emoji: "🍔", label: "Food" },
  { emoji: "🚕", label: "Transport" },
  { emoji: "🎮", label: "Fun" },
];

export default function ThemePreviewPage() {
  const gridData = sampleGridData();
  const [digits, setDigits] = useState("842");
  const [chip, setChip] = useState("Transport");
  const [field, setField] = useState("");
  const amount = digits === "" ? 0 : Number(digits) / 100;

  return (
    <div className="flex min-h-screen flex-col gap-10 bg-bg px-5 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="glow-text font-sans text-[1.4rem] font-extrabold text-accent">
          Theme preview — Tron: Ares
        </h1>
        <p className="text-[0.85rem] text-text-muted">
          Sample data only. No login, no database reads. Approve or ask for changes.
        </p>
      </header>

      {/* ---- Nav sample ---- */}
      <Section title="Nav">
        <nav className="flex items-center gap-1 rounded-xl border border-border bg-surface p-2">
          <span className="glow-text mr-3 pl-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent">
            Afterburner
          </span>
          {[
            { label: "Panel", active: true },
            { label: "Days", active: false },
            { label: "Spend", active: false },
          ].map((item) => (
            <span
              key={item.label}
              className={`relative rounded-md px-3 py-1.5 text-[14px] ${
                item.active ? "glow-text text-accent" : "text-text-muted"
              }`}
            >
              {item.active && (
                <span
                  className="absolute left-0 top-[4px] bottom-[4px] w-[2px] rounded-full bg-accent"
                  aria-hidden="true"
                />
              )}
              {item.label}
            </span>
          ))}
        </nav>
      </Section>

      {/* ---- Fitness card: per-sport accents ---- */}
      <Section title="Fitness card — per-sport accents">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-bold text-text">This week</h2>
          {KNOWN_SPORTS.map((s) => (
            <SportRow key={s.slug} slug={s.slug} label={s.label} minutes={[40, 55, 30, 65, 20, 50][0]} />
          ))}
          {/* A sport outside the fixed six — colour comes from sportAccent(),
              not a CSS selector, proving the deterministic fallback works. */}
          <SportRow slug={CUSTOM_SPORT.slug} label={`${CUSTOM_SPORT.label} (new, hashed colour)`} minutes={45} inline />

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={`rounded-[10px] bg-accent px-4 py-2 font-bold text-accent-ink ${focusRing}`}
            >
              Log today
            </button>
            <input
              type="text"
              placeholder="Form field"
              value={field}
              onChange={(e) => setField(e.target.value)}
              className={`rounded-lg border-[1.5px] border-border bg-bg px-3 py-2 text-[16px] text-text focus:border-accent ${focusRing}`}
            />
          </div>
        </div>
      </Section>

      {/* ---- Contribution grid ---- */}
      <Section title="Contribution grid — four states must stay distinguishable">
        <div data-sport="run" className="rounded-2xl border border-border bg-surface p-4">
          <ContributionGrid today={TODAY} {...gridData} />
        </div>
      </Section>

      {/* ---- Spend side ---- */}
      <div
        data-spend
        className={`${bricolage.variable} ${atkinson.variable} flex flex-col gap-10 rounded-2xl border border-border bg-surface p-5 font-spend-body`}
      >
        <Section title="Spend hero — Legacy, cyan accent">
          <div>
            <p className="glow-text font-spend-display text-[3rem] font-extrabold leading-none text-text">
              {money.format(2650)}
            </p>
            <p className="font-spend-display text-[1.1rem] font-medium text-text">left this week</p>
            <p className="mt-1 text-text-muted">₹379/day · 5 days left</p>
          </div>
        </Section>

        <Section title="Bars — on pace / ahead of pace / over (crimson + amber reserved here)">
          <div className="flex flex-col gap-4">
            {BAR_DEMOS.map((b) => (
              <DemoBar key={b.label} {...b} />
            ))}
          </div>
        </Section>

        <Section title="Quick-add keypad">
          <div className="flex w-full max-w-[340px] flex-col items-center gap-4">
            <p className="font-spend-display text-[2.4rem] font-extrabold tabular-nums text-text">
              {money.format(amount)}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {CHIPS.map((c) => {
                const selected = chip === c.label;
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setChip(c.label)}
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
                  onClick={() => {
                    if (key === "⌫") setDigits((d) => d.slice(0, -1));
                    else if (key !== "") setDigits((d) => (d.length >= 9 ? d : d + key));
                  }}
                  className={`rounded-xl border-[1.5px] border-border py-3.5 font-spend-display text-[1.3rem] font-bold text-text ${focusRing} ${
                    key === "" ? "invisible" : "hover:border-accent"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`w-full rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing}`}
            >
              Add {money.format(amount)}
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

function SportRow({
  slug,
  label,
  minutes,
  inline,
}: {
  slug: string;
  label: string;
  minutes: number;
  inline?: boolean;
}) {
  // Known sports get their colour from the [data-sport] CSS selector in
  // globals.css. A sport outside that fixed set (inline=true here) gets it
  // from the deterministic hash fallback instead, applied as an inline
  // style — exactly how a real new sport would be coloured in chunk C2.
  const style = inline ? ({ "--accent": sportAccent(slug) } as React.CSSProperties) : undefined;
  return (
    <div data-sport={inline ? undefined : slug} style={style} className="flex items-center gap-3">
      <span className="h-3 w-3 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span className="flex-1 text-text">{label}</span>
      <span className="text-text-muted">{minutes} min</span>
    </div>
  );
}

function DemoBar({
  label,
  total,
  budget,
  pace,
  state,
}: {
  label: string;
  total: number;
  budget: number;
  pace: number;
  state: "pace" | "ahead" | "over";
}) {
  const pct = (total / budget) * 100;
  const isOver = state === "over";
  const isAhead = state === "ahead";
  const basePct = Math.min(100, pct) / 1.5;
  const overflowPct = isOver ? Math.min(50, pct - 100) / 1.5 : 0;
  const pacePct = Math.min(100, (pace / budget) * 100) / 1.5;
  const fill = isOver ? "bg-over" : isAhead ? "bg-signal" : "bg-accent";
  const sideLabel = isOver
    ? `${money.format(total - budget)} over`
    : `${money.format(budget - total)} left`;
  const sideColor = isOver ? "text-over" : isAhead ? "text-signal" : "text-text-muted";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[0.92rem]">
        <span className="text-text">{label}</span>
        <span className={`font-bold tabular-nums ${isOver ? "text-over" : "text-text"}`}>
          {money.format(total)} / {money.format(budget)}
        </span>
      </div>
      <div className="relative h-[8px] w-full rounded-full bg-border">
        <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${basePct}%` }} />
        {isOver && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-over"
            style={{ left: `${100 / 1.5}%`, width: `${overflowPct}%` }}
          />
        )}
        <div
          className="pointer-events-none absolute top-[-3px] bottom-[-3px] w-px bg-text/35"
          style={{ left: `${100 / 1.5}%` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-[-3px] bottom-[-3px] w-px bg-text/70"
          style={{ left: `${pacePct}%` }}
          aria-hidden="true"
        />
      </div>
      <p className={`text-[0.78rem] ${sideColor}`}>
        {sideLabel} {isAhead ? "— ahead of pace" : isOver ? "— over" : ""}
      </p>
    </div>
  );
}
