import Link from "next/link";
import { createClient, getClaims } from "@/lib/supabase/server";
import { sweepExpiredWaitlist } from "./actions";
import { WaitlistClient, type WaitlistItem } from "./WaitlistClient";

export default async function WaitlistPage() {
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-[13px] text-text-muted">Not signed in.</p>
      </main>
    );
  }

  // No cron here — anything 7 days past its 48h unlock expires lazily,
  // right before this page reads its own rows, so a stale "pending" item
  // never renders as still-waiting.
  await sweepExpiredWaitlist();

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("wait_list")
    .select("id, item, category, price, added_at, decision, decided_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  const items: WaitlistItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    item: r.item,
    category: r.category,
    price: Number(r.price),
    added_at: r.added_at,
    decision: r.decision as "pending" | "bought" | "expired" | "dropped",
  }));

  const savedByWaiting = items
    .filter((i) => i.decision === "expired")
    .reduce((sum, i) => sum + i.price, 0);

  return (
    <main className="flex flex-1 justify-center">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-[18px] pt-5 pb-16 [padding-bottom:calc(64px+env(safe-area-inset-bottom))]">
        <Link href="/spend" className="self-start text-[0.9rem] text-text-muted hover:text-text">
          ← Spend
        </Link>
        <h1 className="glow-text font-spend-display text-[1.3rem] font-bold text-text">48-hour waitlist</h1>
        <WaitlistClient items={items} savedByWaiting={savedByWaiting} />
      </div>
    </main>
  );
}
