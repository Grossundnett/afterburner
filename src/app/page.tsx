import Link from "next/link";

import { ContributionGrid } from "@/components/contribution-grid";
import { SiteHeader } from "@/components/site-header";
import { WeekComparison } from "@/components/week-comparison";
import { WeightTrend } from "@/components/weight-trend";
import { addDays, formatDate, todayIn, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const WINDOW_DAYS = 90;

export default async function Panel() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const email = claims?.claims.email;

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

  const [{ data: metrics }, { data: activities }, { data: days }] =
    await Promise.all([
      supabase
        .from("body_metrics")
        .select("date, weight_kg")
        .eq("user_id", userId)
        .not("weight_kg", "is", null)
        .gte("date", from)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("activities")
        .select("date, duration_s, sport, distance_m, avg_pace_s_per_km")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("days")
        .select("date, wake_time, sleep_time, blocker_code")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", today)
        .order("date", { ascending: true }),
    ]);

  const minutesByDate = new Map<string, number>();
  for (const a of activities ?? []) {
    if (a.duration_s !== null) {
      const prev = minutesByDate.get(a.date) ?? 0;
      minutesByDate.set(a.date, prev + Math.round(a.duration_s / 60));
    }
  }

  const thisMonday = weekStart(today);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);

  const thisDays = (days ?? []).filter(
    (d) => d.date >= thisMonday && d.date <= today,
  );
  const lastDays = (days ?? []).filter(
    (d) => d.date >= lastMonday && d.date <= lastSunday,
  );
  const thisActivities = (activities ?? []).filter(
    (a) => a.date >= thisMonday && a.date <= today,
  );
  const lastActivities = (activities ?? []).filter(
    (a) => a.date >= lastMonday && a.date <= lastSunday,
  );

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

        <ContributionGrid today={today} minutesByDate={minutesByDate} />

        <WeightTrend points={weightPoints} today={today} />

        <WeekComparison
          thisDays={thisDays}
          lastDays={lastDays}
          thisActivities={thisActivities}
          lastActivities={lastActivities}
        />
      </div>
    </main>
  );
}
