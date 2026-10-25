import Link from "next/link";
import { createClient, getClaims } from "@/lib/supabase/server";
import { addDays, cycleMonth, cycleBoundsForMonth, daysBetween, todayIn, weekStart } from "@/lib/dates";
import type { Dashboard } from "../SpendClient";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const CHALLENGES: Record<string, string> = {
  Food: "Plan this week's meals before Monday — most Food overspend starts as a last-minute decision.",
  Transport: "Wake by 07:00 three days this week — that's the bike-taxi trigger.",
  Fun: "Pick one Fun spend to skip this week, decided before it happens, not after.",
  Subscriptions: "Cancel one subscription you haven't opened in the last 30 days.",
  Other: "Tag the next Other spend with a note — most Other overspend is really something that belongs in a real category.",
};
const NO_LEAK_CHALLENGE = "Nothing leaked this week — keep doing what you're doing.";

/** Every bucket's flat per-week share of its budget, for comparing actual
 * weekly spend against something steadier than the day-weighted curve.
 * Weekly-kind buckets (Food/Transport) use their own weekly rate as-is;
 * monthly-kind buckets split their monthly budget evenly across the weeks
 * in the cycle. This is an approximation, not a second copy of
 * _spend_week_allowance's day-weighting — "which bucket hurt most this
 * week" doesn't need that precision, and a second exact replica would just
 * be another place the two could silently drift apart. See SPRINT_NOTES.md
 * item 8. Shopping is never included — under new rules it's a fund, not a
 * budget (old rules' flat Shopping budget isn't excluded here either way,
 * since this helper reads category_budgets generically). */
function weekShares(
  categoryBudgets: Record<string, number>,
  weeksInCycle: number,
): Record<string, number> {
  const shares: Record<string, number> = {};
  for (const bucket of ["Food", "Transport", "Fun", "Subscriptions", "Other"]) {
    const budget = categoryBudgets[bucket] ?? 0;
    shares[bucket] = bucket === "Food" || bucket === "Transport" ? budget : budget / weeksInCycle;
  }
  return shares;
}

export default async function ReviewPage() {
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-[13px] text-text-muted">Not signed in.</p>
      </main>
    );
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const today = todayIn(profile?.timezone ?? "UTC");
  const month = cycleMonth(today);

  const [{ data: dashboardRaw }, { data: plan }, { data: catRows }] = await Promise.all([
    supabase.rpc("get_dashboard", { p_today: today }),
    supabase
      .from("spend_month_plans")
      .select("category_budgets")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle(),
    supabase
      .from("spend_categories")
      .select("key, group")
      .eq("user_id", userId),
  ]);

  const dashboard = dashboardRaw as Dashboard | null;
  if (!dashboard || dashboard.has_plan === false || !plan) {
    return (
      <main className="flex flex-1 justify-center">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-[18px] pt-5 pb-16">
          <Link href="/spend" className="self-start text-[0.9rem] text-text-muted hover:text-text">
            ← Spend
          </Link>
          <p className="text-text-muted">No plan set for this cycle yet — nothing to review.</p>
        </div>
      </main>
    );
  }

  const categoryBudgets = (plan.category_budgets as Record<string, number>) ?? {};
  const { start: cycleStart, end: cycleEnd } = cycleBoundsForMonth(month);
  const weeksInCycle = (daysBetween(cycleStart, cycleEnd) + 1) / 7;
  const shares = weekShares(categoryBudgets, weeksInCycle);

  const keyToGroup = new Map((catRows ?? []).map((c) => [c.key, c.group]));

  const spendByBucket = async (weekMon: string, weekEnd: string) => {
    const { data: rows } = await supabase
      .from("expenses")
      .select("amount, category")
      .eq("user_id", userId)
      .gte("spent_on", weekMon)
      .lte("spent_on", weekEnd);
    const totals: Record<string, number> = {};
    for (const r of rows ?? []) {
      const group = keyToGroup.get(r.category);
      if (!group || group === "Shopping") continue;
      totals[group] = (totals[group] ?? 0) + Number(r.amount);
    }
    return totals;
  };

  // --- Leak of the week (Monday of this ISO week through today) -----------
  const thisWeekMon = weekStart(today);
  const thisWeekTotals = await spendByBucket(thisWeekMon, today);
  let leakBucket: string | null = null;
  let leakAmount = 0;
  for (const bucket of Object.keys(shares)) {
    const over = (thisWeekTotals[bucket] ?? 0) - shares[bucket];
    if (over > leakAmount) {
      leakAmount = over;
      leakBucket = bucket;
    }
  }

  // --- Streak: consecutive COMPLETED past ISO weeks (not this one, still
  // in progress) under the same flat week-share total, newest first,
  // stopping at the first loss or 12 weeks back. Uses this cycle's own
  // budgets for every week looked at, even one that fell in an earlier
  // cycle — an approximation noted in SPRINT_NOTES.md item 8. -------------
  const totalShare = Object.values(shares).reduce((s, v) => s + v, 0);
  let streak = 0;
  for (let i = 1; i <= 12; i++) {
    const weekMon = addDays(thisWeekMon, -7 * i);
    const weekEnd = addDays(weekMon, 6);
    const totals = await spendByBucket(weekMon, weekEnd);
    const total = Object.values(totals).reduce((s, v) => s + v, 0);
    if (total <= totalShare) {
      streak++;
    } else {
      break;
    }
  }

  const over = dashboard.budget_left_this_week < 0;
  const challenge = leakBucket ? CHALLENGES[leakBucket] : NO_LEAK_CHALLENGE;

  return (
    <main className="flex flex-1 justify-center">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-[18px] pt-5 pb-16 [padding-bottom:calc(64px+env(safe-area-inset-bottom))]">
        <Link href="/spend" className="self-start text-[0.9rem] text-text-muted hover:text-text">
          ← Spend
        </Link>
        <h1 className="glow-text font-spend-display text-[1.3rem] font-bold text-text">Weekly review</h1>

        <div className="rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <p className="text-text-muted">This week</p>
          <p className={`font-spend-display tabular-nums text-[1.8rem] font-bold ${over ? "text-over" : "text-text"}`}>
            {money.format(Math.abs(dashboard.budget_left_this_week))} {over ? "over" : "under"}
          </p>
        </div>

        <div className="rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <p className="text-text-muted">Leak of the week</p>
          <p className="font-spend-display tabular-nums text-[1.2rem] font-bold text-text">
            {leakBucket ? `${leakBucket} — ${money.format(leakAmount)} over its weekly share` : "No clear leak"}
          </p>
        </div>

        <div className="rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <p className="text-text-muted">Challenge</p>
          <p className="text-text">1. {challenge}</p>
        </div>

        <div className="rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <p className="text-text-muted">Streak</p>
          <p className="font-spend-display text-[1.2rem] font-bold text-text">
            {streak} {streak === 1 ? "week" : "weeks"} under
          </p>
        </div>
      </div>
    </main>
  );
}
