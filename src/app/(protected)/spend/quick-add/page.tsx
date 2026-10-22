import { createClient, getClaims } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
import { QuickAddClient, type QuickCategory } from "./QuickAddClient";

/** This hour's category chips, ranked by how often that category gets used
 * at this hour historically, ties broken by overall frequency, then filled
 * out to 6 from the user's full category list in sort order if history is
 * thin. Built from the most recent 500 spends — recent habit beats a
 * lifetime average for "what am I about to log right now", and it keeps
 * this one query light regardless of how long the account's been in use. */
function rankCategories(
  rows: { category: string; created_at: string }[],
  catMeta: Map<string, { label: string; emoji: string; sort: number }>,
  currentHour: number,
): string[] {
  const atHour = new Map<string, number>();
  const overall = new Map<string, number>();
  for (const r of rows) {
    overall.set(r.category, (overall.get(r.category) ?? 0) + 1);
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(
        new Date(r.created_at),
      ),
    );
    if (hour === currentHour) {
      atHour.set(r.category, (atHour.get(r.category) ?? 0) + 1);
    }
  }

  const ranked = [...catMeta.keys()].sort((a, b) => {
    const atDiff = (atHour.get(b) ?? 0) - (atHour.get(a) ?? 0);
    if (atDiff !== 0) return atDiff;
    const overallDiff = (overall.get(b) ?? 0) - (overall.get(a) ?? 0);
    if (overallDiff !== 0) return overallDiff;
    return (catMeta.get(a)?.sort ?? 0) - (catMeta.get(b)?.sort ?? 0);
  });

  return ranked.slice(0, 6);
}

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
      .select("key, label, emoji, sort")
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
    (catRows ?? []).map((c) => [c.key, { label: c.label, emoji: c.emoji, sort: c.sort }]),
  );
  const rankedKeys = rankCategories(recentRows ?? [], catMeta, currentHour);
  const categories: QuickCategory[] = rankedKeys.map((key) => ({
    key,
    label: catMeta.get(key)!.label,
    emoji: catMeta.get(key)!.emoji,
  }));

  return (
    <main className="flex flex-1 justify-center" data-spend>
      <QuickAddClient today={today} categories={categories} />
    </main>
  );
}
