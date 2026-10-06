import { BlockersChart } from "@/components/blockers-chart";
import { ContributionGrid } from "@/components/contribution-grid";
import { RunningChart } from "@/components/running-chart";
import { SleepWake } from "@/components/sleep-wake";
import { WeekComparison } from "@/components/week-comparison";
import { WeightTrend } from "@/components/weight-trend";
import { addDays, formatDate, todayIn, weekStart } from "@/lib/dates";
import { createClient, getClaims } from "@/lib/supabase/server";

// Must match the contribution grid's 7x13 cell count (91 days) — a mismatch
// here means the grid's oldest column has no data to show even when the user
// logged something that day.
const WINDOW_DAYS = 91;

export default async function Panel() {
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
  // Separate from minutesByDate: duration is optional on an activity (a gym
  // entry can be just a sport, no time typed), so "was something logged" and
  // "how many minutes" are different questions. The streak answers the first
  // one — it must not go to zero just because duration was left blank.
  const activeDates = new Set<string>();
  for (const a of activities ?? []) {
    activeDates.add(a.date);
    if (a.duration_s !== null) {
      const prev = minutesByDate.get(a.date) ?? 0;
      minutesByDate.set(a.date, prev + Math.round(a.duration_s / 60));
    }
  }

  // A `days` row exists whenever the log form was saved for that date, even
  // with every field blank — the closest signal this schema has to "visited
  // and logged" vs "nothing recorded at all" for the grid's honest-gaps split.
  const loggedDates = new Set((days ?? []).map((d) => d.date));
  const blockedDates = new Set(
    (days ?? []).flatMap((d) => (d.blocker_code ? [d.date] : [])),
  );

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
      <div className="flex w-full max-w-[900px] flex-col gap-5">
        <h1 className="text-[24px] font-semibold tracking-tight text-text">
          Panel
        </h1>

        <p className="font-mono text-[13px] tracking-[0.02em] text-text-muted">
          {formatDate(from, "row")} — {formatDate(today, "row")}
        </p>

        {/* Grid and weight span full width on all screens */}
        <ContributionGrid
          today={today}
          minutesByDate={minutesByDate}
          activeDates={activeDates}
          loggedDates={loggedDates}
          blockedDates={blockedDates}
        />

        <WeightTrend points={weightPoints} today={today} />

        {/* Four cards: single column on mobile, two columns at ≥900px */}
        <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2">
          <WeekComparison
            thisDays={thisDays}
            lastDays={lastDays}
            thisActivities={thisActivities}
            lastActivities={lastActivities}
          />

          <SleepWake days={days ?? []} today={today} />

          <BlockersChart days={days ?? []} />

          <RunningChart activities={activities ?? []} today={today} />
        </div>
      </div>
    </main>
  );
}
