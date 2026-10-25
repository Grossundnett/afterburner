import { createClient, getClaims } from "@/lib/supabase/server";
import { todayIn, cycleMonth } from "@/lib/dates";
import Link from "next/link";
import { PlanClient, type PlanGroup } from "./PlanClient";

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PlanPage() {
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
  const month = cycleMonth(today); // YYYY-MM governing today's payday cycle

  const [{ data: plan }, { data: catRows }, { data: balanceRows }, { data: settingsRow }] =
    await Promise.all([
      supabase
        .from("spend_month_plans")
        .select("salary,investments,savings_target,shopping_accrual,category_budgets")
        .eq("user_id", userId)
        .eq("month", month)
        .maybeSingle(),
      supabase
        .from("spend_categories")
        .select("key, label, emoji, kind, sort, group, subgroup")
        .eq("user_id", userId)
        .order("sort", { ascending: true }),
      supabase
        .from("spend_balances")
        .select("account, amount, snapshot_at")
        .eq("user_id", userId)
        .order("snapshot_at", { ascending: false }),
      supabase
        .from("spend_settings")
        .select("count_bob_as_cash")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  // Latest snapshot per account — balanceRows is newest-first, so the first
  // occurrence of each account is its current snapshot.
  const latestBalances: Record<string, number> = {};
  for (const row of balanceRows ?? []) {
    if (!(row.account in latestBalances)) latestBalances[row.account] = Number(row.amount);
  }

  // One row per group, built per kind separately so Food/Transport surface
  // on the weekly card and the rest on the monthly card. Under 0018's
  // model every category is self-grouped (key === group), so this is just
  // "the six rows of this kind" — kept as a group-keyed map rather than a
  // flat list since PlanClient's shape still expects one.
  function buildGroups(kind: "weekly" | "monthly"): PlanGroup[] {
    const map = new Map<string, PlanGroup>();
    for (const cat of catRows ?? []) {
      if (!cat.group || cat.kind !== kind) continue;
      if (!map.has(cat.group)) {
        map.set(cat.group, { group: cat.group, emoji: cat.emoji, label: cat.group });
      }
    }
    return [...map.values()];
  }

  const weeklyGroups = buildGroups("weekly");
  const monthlyGroups = buildGroups("monthly");

  const storedBudgets =
    plan?.category_budgets != null && typeof plan.category_budgets === "object"
      ? (plan.category_budgets as Record<string, number>)
      : {};

  return (
    <main className="flex flex-1 justify-center">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-[18px] pt-5 pb-16 [padding-bottom:calc(64px+env(safe-area-inset-bottom))]">
        <Link
          href="/spend"
          className="self-start text-[0.9rem] text-text-muted hover:text-text"
        >
          ← Spend
        </Link>

        <PlanClient
          month={month}
          monthLabel={monthLabel(month)}
          salary={Number(plan?.salary ?? 0)}
          investments={Number(plan?.investments ?? 0)}
          savings_target={Number(plan?.savings_target ?? 0)}
          shopping_accrual={Number(plan?.shopping_accrual ?? 0)}
          category_budgets={storedBudgets}
          weeklyGroups={weeklyGroups}
          monthlyGroups={monthlyGroups}
          balances={latestBalances}
          countBobAsCash={settingsRow?.count_bob_as_cash ?? true}
        />
      </div>
    </main>
  );
}
