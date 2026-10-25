import { addDays, isIsoDate, todayIn, weekStart } from "@/lib/dates";
import { createClient, getClaims } from "@/lib/supabase/server";
import type { QuickCategory } from "./quick-add/QuickAddClient";

import { SpendClient, type Dashboard, type Expense, type SpendCategory } from "./SpendClient";

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;

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
  // all land on a real week rather than a half-week slice. This drives only
  // the collapsed browse-history section below the fold — the hero, move
  // card and category bars above it always reflect today's own cycle/week,
  // computed server-side by get_dashboard regardless of which week is browsed.
  const weekMon = weekStart(isIsoDate(params.week) ? params.week : today);
  const weekSun = addDays(weekMon, 6);
  const currentWeekMon = weekStart(today);

  const [{ data: dashboard }, { data: weekRows }, { data: catRows }, { data: transferRow }] =
    await Promise.all([
      supabase.rpc("get_dashboard", { p_today: today }),
      supabase
        .from("expenses")
        .select("id, amount, category, note, spent_on, created_at")
        .eq("user_id", userId)
        .gte("spent_on", weekMon)
        .lte("spent_on", weekSun)
        .order("created_at", { ascending: false }),
      // Under 0018's model this is exactly the six top-level categories —
      // no ranking/subsetting needed anymore (there used to be dozens of
      // fine-grained Wallet keys to pick six best-of from; now there are
      // only six, full stop).
      supabase
        .from("spend_categories")
        .select("key, label, emoji, kind, sort, group, subgroup")
        .eq("user_id", userId)
        .order("sort", { ascending: true }),
      supabase
        .from("spend_transfers")
        .select("week_mon")
        .eq("user_id", userId)
        .eq("week_mon", currentWeekMon)
        .maybeSingle(),
    ]);

  const quickAddCategories: QuickCategory[] = (catRows ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    emoji: c.emoji,
  }));

  // Emotion footnote: Fun/Shopping spend over the last 4 weeks, tagged or
  // not. Only shown once at least one entry in that window has been tagged
  // — a 0% line for someone who's never used the picker would read as a
  // judgement rather than a reflection of their own choice not to tag.
  const funBigBuyKeys = new Set(
    (catRows ?? []).filter((c) => c.group === "Fun" || c.group === "Shopping").map((c) => c.key),
  );
  let emotionStat: { pct: number; tag: string } | null = null;
  if (funBigBuyKeys.size > 0) {
    const fourWeeksAgo = addDays(today, -28);
    const { data: emotionRows } = await supabase
      .from("expenses")
      .select("amount, category, emotion")
      .eq("user_id", userId)
      .gte("spent_on", fourWeeksAgo)
      .lte("spent_on", today);

    const relevant = (emotionRows ?? []).filter((r) => funBigBuyKeys.has(r.category));
    const total = relevant.reduce((s, r) => s + Number(r.amount), 0);
    const byTag = new Map<string, number>();
    for (const r of relevant) {
      if (!r.emotion) continue;
      byTag.set(r.emotion, (byTag.get(r.emotion) ?? 0) + Number(r.amount));
    }
    if (total > 0 && byTag.size > 0) {
      const [topTag, topAmount] = [...byTag.entries()].sort((a, b) => b[1] - a[1])[0];
      emotionStat = { pct: Math.round((topAmount / total) * 100), tag: topTag };
    }
  }

  const initialExpenses: Expense[] = (weekRows ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    category: row.category,
    note: row.note,
    spent_on: row.spent_on,
    created_at: row.created_at,
  }));

  const categories: SpendCategory[] = (catRows ?? []).map((r) => ({
    key: r.key,
    label: r.label,
    emoji: r.emoji,
    kind: r.kind,
    sort: r.sort,
    group: r.group ?? null,
    subgroup: r.subgroup ?? null,
  }));

  return (
    <main data-spend className="flex flex-1 justify-center">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-[18px] pt-5 pb-20 [padding-bottom:calc(72px+env(safe-area-inset-bottom))]">
        <SpendClient
          weekMon={weekMon}
          currentWeekMon={currentWeekMon}
          today={today}
          initialExpenses={initialExpenses}
          quickAddCategories={quickAddCategories}
          categories={categories}
          dashboard={dashboard as Dashboard}
          isMonday={today === currentWeekMon}
          transferTicked={transferRow != null}
          emotionStat={emotionStat}
        />
      </div>
    </main>
  );
}
