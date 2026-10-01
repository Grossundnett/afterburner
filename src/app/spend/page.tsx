import { SiteHeader } from "@/components/site-header";
import { addDays, isIsoDate, todayIn, weekStart } from "@/lib/dates";
import { createClient, getClaims } from "@/lib/supabase/server";

import { SpendClient, type Expense } from "./SpendClient";

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;
  const email = claims?.claims.email;

  // The proxy redirects before this renders, so this is belt and braces rather
  // than the real guard — but nothing here may assume a user exists.
  if (!userId) {
    return (
      <main data-spend className="flex flex-1 items-center justify-center p-6">
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

  // Normalised to the containing week's Monday regardless of what the URL
  // holds, so a missing param, a hand-edited non-Monday date, or a stale link
  // all land on a real week rather than a half-week slice.
  const weekMon = weekStart(isIsoDate(params.week) ? params.week : today);
  const weekSun = addDays(weekMon, 6);
  const currentWeekMon = weekStart(today);

  // 8 weeks ending at the selected week, in one range query grouped in code —
  // the week-by-week totals below are derived from this single result set
  // rather than eight separate queries.
  const historyStart = addDays(weekMon, -49);

  const [{ data: weekRows }, { data: settings }, { data: history }] =
    await Promise.all([
      supabase
        .from("expenses")
        .select("id, amount, category, note, spent_on, created_at")
        .eq("user_id", userId)
        .gte("spent_on", weekMon)
        .lte("spent_on", weekSun)
        .order("created_at", { ascending: false }),
      supabase
        .from("spend_settings")
        .select("weekly_budget")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("expenses")
        .select("spent_on, amount")
        .eq("user_id", userId)
        .gte("spent_on", historyStart)
        .lte("spent_on", weekSun),
    ]);

  const budget = settings?.weekly_budget ?? 5000;

  const weekTotals = Array.from({ length: 8 }, (_, i) => {
    const mon = addDays(weekMon, -(7 - i) * 7);
    const sun = addDays(mon, 6);
    const total = (history ?? [])
      .filter((row) => row.spent_on >= mon && row.spent_on <= sun)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return { mon, total };
  });

  const initialExpenses: Expense[] = (weekRows ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    category: row.category as Expense["category"],
    note: row.note,
    spent_on: row.spent_on,
    created_at: row.created_at,
  }));

  return (
    <main data-spend className="flex flex-1 justify-center">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-[18px] pt-5 pb-16 [padding-bottom:calc(64px+env(safe-area-inset-bottom))]">
        <SiteHeader email={email} current="spend" />

        <SpendClient
          weekMon={weekMon}
          currentWeekMon={currentWeekMon}
          today={today}
          budget={budget}
          initialExpenses={initialExpenses}
          weekTotals={weekTotals}
        />
      </div>
    </main>
  );
}
