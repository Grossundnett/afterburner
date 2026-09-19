import { BLOCKER_CODES, BLOCKER_LABELS } from "@/lib/blockers";
import { createClient } from "@/lib/supabase/server";

import { saveDay } from "./actions";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-3 text-[16px] text-text " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const label = "text-[13px] tracking-[0.02em] text-text-muted";

/**
 * Today, in the person's own timezone rather than the server's.
 *
 * Vercel runs in UTC. Logging at 01:00 in Asia/Kolkata is still 19:30 the
 * previous day in UTC, so a naive toISOString() would default the form to
 * yesterday exactly when someone is logging late at night — the most likely
 * moment to be using it. en-CA formats as YYYY-MM-DD, which is what the date
 * input wants.
 */
function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    // An unrecognised timezone string would otherwise throw and take the page
    // down. UTC is wrong by a few hours; a blank page is wrong entirely.
    return new Date().toISOString().slice(0, 10);
  }
}

/** Postgres returns time as HH:MM:SS; the input wants HH:MM. */
const asInputTime = (value: string | null) => value?.slice(0, 5) ?? "";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

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

  const date =
    params.date && DATE.test(params.date)
      ? params.date
      : todayIn(profile?.timezone ?? "UTC");

  // Both reads are filtered by the authenticated user as well as the date. RLS
  // would enforce that anyway; saying it here means the query is correct on its
  // own terms rather than only because the database rescues it.
  const [{ data: day }, { data: metrics }] = await Promise.all([
    supabase
      .from("days")
      .select("wake_time, sleep_time, blocker_code, blocker_note, notes")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle(),
    supabase
      .from("body_metrics")
      .select("weight_kg")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle(),
  ]);

  return (
    <main data-sport="discipline" className="flex flex-1 justify-center p-5">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-semibold tracking-tight text-text">
            Log a day
          </h1>
          <p className={label}>
            Everything except the date is optional. Blank clears.
          </p>
        </div>

        {params.saved ? (
          <p
            role="status"
            className="border border-border bg-surface-2 p-3 text-[13px] font-medium text-accent"
          >
            Saved.
          </p>
        ) : null}

        {params.error ? (
          <p
            role="alert"
            className="border border-border bg-surface-2 p-3 text-[13px] font-medium text-text"
          >
            {params.error}
          </p>
        ) : null}

        <form action={saveDay} className="flex flex-col gap-5">
          {/* What the form was rendered with. If the date input is changed to
              some other day, the action preserves blanks instead of clearing,
              because those stored values were never shown. */}
          <input type="hidden" name="loaded_date" value={date} />

          <div className="flex flex-col gap-2">
            <label htmlFor="date" className={label}>
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={date}
              className={`${field} font-mono`}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor="wake_time" className={label}>
                Wake
              </label>
              <input
                id="wake_time"
                name="wake_time"
                type="time"
                defaultValue={asInputTime(day?.wake_time ?? null)}
                className={`${field} font-mono`}
              />
            </div>

            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor="sleep_time" className={label}>
                Sleep
              </label>
              <input
                id="sleep_time"
                name="sleep_time"
                type="time"
                defaultValue={asInputTime(day?.sleep_time ?? null)}
                className={`${field} font-mono`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="weight_kg" className={label}>
              Weight, kg
            </label>
            <input
              id="weight_kg"
              name="weight_kg"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              defaultValue={metrics?.weight_kg ?? ""}
              className={`${field} font-mono tabular-nums`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="blocker_code" className={label}>
              What got in the way
            </label>
            <select
              id="blocker_code"
              name="blocker_code"
              defaultValue={day?.blocker_code ?? ""}
              className={field}
            >
              <option value="">Nothing</option>
              {BLOCKER_CODES.map((code) => (
                <option key={code} value={code}>
                  {BLOCKER_LABELS[code]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="blocker_note" className={label}>
              Blocker note, if other
            </label>
            <input
              id="blocker_note"
              name="blocker_note"
              type="text"
              maxLength={500}
              defaultValue={day?.blocker_note ?? ""}
              className={field}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="notes" className={label}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={day?.notes ?? ""}
              className={`${field} resize-y`}
            />
          </div>

          <button
            type="submit"
            className="w-full cursor-pointer rounded-md border border-accent bg-surface px-4 py-3 text-[15px] font-medium text-accent transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Save day
          </button>
        </form>
      </div>
    </main>
  );
}
