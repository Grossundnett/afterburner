import { createClient, getClaims } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
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

  const [{ data: profile }, { data: catRows }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
    // Exactly the six top-level categories under 0018's model — no ranking
    // needed, there's nothing left to narrow down from.
    supabase
      .from("spend_categories")
      .select("key, label, emoji, sort")
      .eq("user_id", userId)
      .order("sort", { ascending: true }),
  ]);

  const today = todayIn(profile?.timezone ?? "UTC");
  const categories: QuickCategory[] = (catRows ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    emoji: c.emoji,
  }));

  return (
    <main className="flex flex-1 justify-center" data-spend>
      <QuickAddClient today={today} categories={categories} />
    </main>
  );
}
