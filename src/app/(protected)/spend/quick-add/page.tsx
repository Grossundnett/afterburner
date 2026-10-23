import { createClient, getClaims } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
import { rankCategories } from "@/lib/spend-chip-rank";
import { QuickAddClient, type QuickCategory } from "./QuickAddClient";

export default async function QuickAddPage() {
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

  const [{ data: profile }, { data: catRows }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
    supabase
      .from("spend_categories")
      .select("key, label, emoji, sort, group")
      .eq("user_id", userId)
      .order("sort", { ascending: true }),
    supabase
      .from("expenses")
      .select("category, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const today = todayIn(profile?.timezone ?? "UTC");
  const currentHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(
      new Date(),
    ),
  );

  const catMeta = new Map(
    (catRows ?? []).map((c) => [c.key, { label: c.label, emoji: c.emoji, sort: c.sort, group: c.group ?? null }]),
  );
  const rankedKeys = rankCategories(recentRows ?? [], catMeta, currentHour);
  const categories: QuickCategory[] = rankedKeys.map((key) => ({
    key,
    label: catMeta.get(key)!.label,
    emoji: catMeta.get(key)!.emoji,
    group: catMeta.get(key)!.group,
  }));

  return (
    <main className="flex flex-1 justify-center" data-spend>
      <QuickAddClient today={today} categories={categories} />
    </main>
  );
}
