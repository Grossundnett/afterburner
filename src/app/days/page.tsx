import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { blockerLabel } from "@/lib/blockers";
import { addDays, formatDate, isIsoDate, lastNDates, todayIn } from "@/lib/dates";
import { labelFor, sportMap } from "@/lib/sports";
import { createClient } from "@/lib/supabase/server";

/** How far back the list reaches. One screen of scrolling on a phone. */
const WINDOW = 30;

const muted = "text-[13px] tracking-[0.02em] text-text-muted";

/** Postgres returns time as HH:MM:SS; only the clock part is worth showing. */
const asClock = (value: string | null | undefined) => value?.slice(0, 5) ?? null;

export default async function DaysPage({
  searchParams,
}: {
  searchParams: Promise<{ end?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const email = claims?.claims.email;

  // The proxy redirects before this renders, so this is belt and braces rather
  // than the real guard — but nothing here may assume a user exists.
  if (!userId) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className={muted}>Not signed in.</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  // The spine comes from the calendar, not from the rows. A list built out of
  // query results would omit the days nothing was logged on, which are exactly
  // the days worth seeing.
  // `end` pages the window. Clamped to today so the list never runs into dates
  // that cannot have been logged yet, and validated so a hand-typed value
  // cannot produce a nonsense range.
  const today = todayIn(profile?.timezone ?? "UTC");
  const requestedEnd = isIsoDate(params.end) ? params.end : today;
  const end = requestedEnd > today ? today : requestedEnd;

  const dates = lastNDates(end, WINDOW);
  const oldest = dates[dates.length - 1];
  const newest = dates[0];

  const olderEnd = addDays(oldest, -1);
  const newerEnd = addDays(end, WINDOW);
  const atToday = end === today;

  // Three queries, not one. `days`, `body_metrics` and `activities` each carry
  // their own (user_id, date) and there is no foreign key between them — a
  // weight can exist on a date with no `days` row at all. PostgREST can only
  // embed across a declared relationship, so joining them would mean inventing
  // one purely to serve this screen. Three windowed reads run in parallel and
  // are stitched by date below, which keeps the schema honest about the fact
  // that these are independent observations of the same day.
  const [
    { data: days },
    { data: metrics },
    { data: activities },
    { data: sportList },
  ] = await Promise.all([
      supabase
        .from("days")
        .select("date, wake_time, sleep_time, blocker_code")
        .eq("user_id", userId)
        .gte("date", oldest)
        .lte("date", newest),
      supabase
        .from("body_metrics")
        .select("date, weight_kg")
        .eq("user_id", userId)
        .gte("date", oldest)
        .lte("date", newest),
      supabase
        .from("activities")
        .select("date, sport")
        .eq("user_id", userId)
        .gte("date", oldest)
        .lte("date", newest),
      // A fourth read, but of the vocabulary rather than the window: sports are
      // the user's own rows now, so a stored slug needs their list to render as
      // a label.
      supabase
        .from("sports")
        .select("slug, label, has_distance")
        .eq("user_id", userId),
    ]);

  const bySlug = sportMap(sportList ?? []);

  const dayByDate = new Map((days ?? []).map((row) => [row.date, row]));
  const weightByDate = new Map(
    (metrics ?? []).map((row) => [row.date, row.weight_kg]),
  );

  // Sports per date, de-duplicated but counted: two runs read as "2 · Run",
  // which says more than either the bare count or a repeated label.
  const sportsByDate = new Map<string, string[]>();
  for (const activity of activities ?? []) {
    const list = sportsByDate.get(activity.date) ?? [];
    list.push(activity.sport);
    sportsByDate.set(activity.date, list);
  }

  return (
    <main data-sport="discipline" className="flex flex-1 justify-center p-5">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`truncate font-mono ${muted}`}>{email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="cursor-pointer text-[13px] text-text-muted underline underline-offset-4 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight text-text">
            {atToday ? "Last 30 days" : "30 days"}
          </h1>
          <p className={`font-mono ${muted}`}>
            {formatDate(oldest, "row")} — {formatDate(newest, "row")}
          </p>

          {/* Paging is links rather than a form: it changes what is shown, not
              what is stored, and a link is the address of the thing shown. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <Link
              href={`/days?end=${olderEnd}`}
              className="rounded-md border border-border px-3 py-2 text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              ← Older
            </Link>

            {atToday ? (
              <span className={muted}>Tap a day to log or edit it.</span>
            ) : (
              <Link
                href="/days"
                className="text-[13px] text-accent underline underline-offset-4 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Today
              </Link>
            )}

            {atToday ? (
              <span
                aria-disabled="true"
                className="px-3 py-2 text-[13px] text-text-muted opacity-40"
              >
                Newer →
              </span>
            ) : (
              <Link
                href={`/days?end=${newerEnd}`}
                className="rounded-md border border-border px-3 py-2 text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Newer →
              </Link>
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-px">
          {dates.map((date) => {
            const day = dayByDate.get(date);
            const weight = weightByDate.get(date);
            const sports = sportsByDate.get(date) ?? [];
            const wake = asClock(day?.wake_time);
            const sleep = asClock(day?.sleep_time);
            const logged = Boolean(day || weight !== undefined || sports.length);

            return (
              <li key={date}>
                {/* The whole row is the link, not a word inside it. On a phone
                    the row is the touch target, and anything smaller is a miss
                    waiting to happen. */}
                <Link
                  href={`/log?date=${date}`}
                  className="flex flex-col gap-1 border border-border bg-surface px-3 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`font-mono text-[14px] ${logged ? "text-text" : "text-text-muted"}`}
                    >
                      {formatDate(date, "row")}
                    </span>

                    <span className="font-mono text-[13px] tabular-nums text-text-muted">
                      {wake || sleep ? (
                        <>
                          {wake ?? "--:--"}
                          <span className="px-1 text-text-muted">→</span>
                          {sleep ?? "--:--"}
                        </>
                      ) : null}
                    </span>
                  </div>

                  {/* An empty day renders the row and nothing in it. The gap is
                      the information, so it is left visibly blank rather than
                      filled with a placeholder that would read as data. */}
                  {logged ? (
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                      {sports.length > 0 ? (
                        <span className="text-accent">
                          {sports.length} ·{" "}
                          {[...new Set(sports)]
                            .map((slug) => labelFor(bySlug, slug))
                            .join(", ")}
                        </span>
                      ) : null}

                      {weight !== undefined && weight !== null ? (
                        <span className="font-mono tabular-nums text-text-muted">
                          {weight} kg
                        </span>
                      ) : null}

                      {day?.blocker_code ? (
                        <span className="text-text-muted">
                          {blockerLabel(day.blocker_code)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
