import { createClient, getClaims } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
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
  const month = today.slice(0, 7); // YYYY-MM

  const [{ data: plan }, { data: catRows }] = await Promise.all([
    supabase
      .from("spend_month_plans")
      .select("salary,investments,savings_target,buffer,category_budgets")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle(),
    supabase
      .from("spend_categories")
      .select("key, label, emoji, kind, sort, group, subgroup")
      .eq("user_id", userId)
      .eq("kind", "monthly")
      .order("sort", { ascending: true }),
  ]);

  // One representative per group: prefer the category with no subgroup.
  const groupMap = new Map<string, PlanGroup>();
  for (const cat of catRows ?? []) {
    if (!cat.group) continue;
    const existing = groupMap.get(cat.group);
    if (!existing || cat.subgroup === null) {
      groupMap.set(cat.group, {
        group: cat.group,
        emoji: cat.emoji,
        label: cat.label,
      });
    }
  }
  const monthlyGroups: PlanGroup[] = [...groupMap.values()];

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
          buffer={Number(plan?.buffer ?? 0)}
          category_budgets={storedBudgets}
          monthlyGroups={monthlyGroups}
        />
      </div>
    </main>
  );
}
