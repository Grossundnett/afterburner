import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { WeightTrend } from "@/components/weight-trend";
import { addDays, formatDate, todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * How far back the Panel looks. A quarter reads as a trend where a month reads
 * as noise, and at one row a day it is nothing to query.
 */
const WINDOW_DAYS = 90;

/**
 * The Panel — the dashboard ARCHITECTURE.md section 4 reserves `/` for.
 *
 * This replaces the redirect to /days that BUILD.md step 8 called temporary.
 * Landing here costs one tap on the way to logging, which is why Log today is
 * the first thing on the page; the trade is seeing the trend every time the app
 * opens, which is the behavioural point of keeping one.
 *
 * Only the weight card exists so far, so only body_metrics is read. The other
 * three charts arrive as their own increments.
 */
export default async function Panel() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const email = claims?.claims.email;

  // The proxy redirects before this renders, so this is belt and braces rather
  // than the real guard — but nothing here may assume a user exists.
  if (!userId) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-[13px] text-text-muted">Not signed in.</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  const today = todayIn(profile?.timezone ?? "UTC");
  const from = addDays(today, -(WINDOW_DAYS - 1));

  const { data: metrics } = await supabase
    .from("body_metrics")
    .select("date, weight_kg")
    .eq("user_id", userId)
    .not("weight_kg", "is", null)
    .gte("date", from)
    .lte("date", today)
    .order("date", { ascending: true });

  // Clearing a weight leaves the row with a null, so the filter above matters:
  // a null would otherwise plot as zero and drag the whole axis to the floor.
  const weightPoints = (metrics ?? []).flatMap((row) =>
    row.weight_kg === null ? [] : [{ date: row.date, value: row.weight_kg }],
  );

  return (
    <main className="flex flex-1 justify-center p-5">
      <div className="flex w-full max-w-md flex-col gap-5">
        <SiteHeader email={email} current="panel" />

        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight text-text">
            Panel
          </h1>
          <Link
            href="/log"
            className="rounded-md border border-accent px-3 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Log today
          </Link>
        </div>

        <p className="font-mono text-[13px] tracking-[0.02em] text-text-muted">
          {formatDate(from, "row")} — {formatDate(today, "row")}
        </p>

        <WeightTrend points={weightPoints} />
      </div>
    </main>
  );
}
