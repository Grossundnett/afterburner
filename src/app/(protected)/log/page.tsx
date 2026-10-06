import Link from "next/link";

import { BLOCKER_CODES, BLOCKER_LABELS } from "@/lib/blockers";
import { addDays, formatDate, isIsoDate, todayIn } from "@/lib/dates";
import { hasDistanceFor, labelFor, sportMap } from "@/lib/sports";
import { createClient, getClaims } from "@/lib/supabase/server";
import { formatDurationClock, formatPace, metresToKm } from "@/lib/units";

import { addSport, saveDay } from "./actions";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-3 text-[16px] text-text " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const label = "text-[13px] tracking-[0.02em] text-text-muted";

/** Postgres returns time as HH:MM:SS; the input wants HH:MM. */
const asInputTime = (value: string | null) => value?.slice(0, 5) ?? "";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    saved?: string;
    added?: string;
    removed?: string;
    sport_added?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const { data: claims } = await getClaims();
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

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  const date = isIsoDate(params.date)
    ? params.date
    : todayIn(profile?.timezone ?? "UTC");

  // Both reads are filtered by the authenticated user as well as the date. RLS
  // would enforce that anyway; saying it here means the query is correct on its
  // own terms rather than only because the database rescues it.
  const [
    { data: day },
    { data: metrics },
    { data: activities },
    { data: sports },
  ] = await Promise.all([
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
      supabase
        .from("activities")
        .select("id, sport, distance_m, duration_s, avg_pace_s_per_km, notes")
        .eq("user_id", userId)
        .eq("date", date)
        .order("created_at", { ascending: true }),
      // The sport vocabulary is the user's own, so it is read rather than
      // imported. Position orders the seeded set; created_at orders anything
      // added since, which all share position 110.
      supabase
        .from("sports")
        .select("slug, label, has_distance")
        .eq("user_id", userId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  const bySlug = sportMap(sports ?? []);

  // One banner, whichever action just ran. Every action redirects back here
  // with a flag rather than returning a value, so a refresh cannot replay it.
  const status = params.saved
    ? `Saved for ${formatDate(date, "short")}.${params.added ? " Activity added." : ""}`
    : params.removed
      ? "Activity removed."
      : params.sport_added
        ? "Sport added."
        : null;

  return (
    <main data-sport="discipline" className="flex flex-1 justify-center p-5">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-semibold tracking-tight text-text">
              Log a day
            </h1>

            {/* The date is stated, not inferred from a picker. Every value
                below belongs to this date and only this one.

                Stepping a day is a link, not a control inside the save form:
                it changes which record is shown, so it navigates and the
                server re-renders. The same reason the date picker is its own
                GET form. */}
            <div className="flex items-center gap-2">
              <Link
                href={`/log?date=${addDays(date, -1)}`}
                aria-label="Previous day"
                className="rounded-md border border-border px-3 py-2 text-[15px] leading-none text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                ←
              </Link>

              <p className="flex-1 text-center font-mono text-[15px] text-accent">
                {formatDate(date, "long")}
              </p>

              <Link
                href={`/log?date=${addDays(date, 1)}`}
                aria-label="Next day"
                className="rounded-md border border-border px-3 py-2 text-[15px] leading-none text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                →
              </Link>
            </div>
          </div>

          {/*
            Changing the date is navigation, not part of the save, so it lives
            in its own method="get" form — the browser's native way to navigate
            with parameters. Submitting loads /log?date=YYYY-MM-DD and the
            server re-renders every field below from that date's rows.

            It sits at the top because the date is what the page is about, and
            on a phone the alternative is scrolling past the whole form to
            change it.
          */}
          <form method="get" action="/log" className="flex flex-col gap-2">
            <label htmlFor="jump" className={label}>
              Change date
            </label>
            <div className="flex gap-2">
              <input
                key={date}
                id="jump"
                name="date"
                type="date"
                defaultValue={date}
                className={`${field} font-mono`}
              />
              <button
                type="submit"
                className="cursor-pointer rounded-md border border-border bg-surface px-5 py-3 text-[15px] font-medium text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Go
              </button>
            </div>
          </form>

          <p className={label}>
            Everything except the date is optional. Blank or zero clears.
          </p>
        </div>

        {status ? (
          <p
            role="status"
            className="border border-border bg-surface-2 p-3 text-[13px] font-medium text-accent"
          >
            {status}
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

        <form id="day" action={saveDay} className="flex flex-col gap-5">
          {/* The date is not editable here. Both fields carry what the server
              rendered; the action refuses to write if they disagree. */}
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="loaded_date" value={date} />

          {/* Saves everything on the page, including an activity typed into
              the entry fields below — they belong to this form. */}
          <button
            type="submit"
            className="w-full cursor-pointer rounded-md border border-accent bg-surface px-4 py-3 text-[15px] font-medium text-accent transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Save day
          </button>

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
            {/* step="any" on every measurement below. A numeric step makes the
                browser reject anything off the grid — step="1" refused 32.49
                minutes, step="0.1" would refuse 68.25 kg — and the grid is an
                artefact of the input, not of the measurement. The server
                already coerces, bounds and rounds each value, so validation
                belongs there rather than in an attribute that guesses how
                precise a scale or a watch is. */}
            <input
              id="weight_kg"
              name="weight_kg"
              type="number"
              step="any"
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

        </form>

        {/*
          Stored activities are a list of server-rendered rows, each carrying
          its own database id and its own Remove form, so there is no
          client-side row index that could drift out of step with what is
          stored.

          The entry fields below the list belong to the day form through the
          `form="day"` attribute — they cannot sit inside it, because forms
          cannot nest and the Remove forms are in between. Either button saves
          the day and the typed activity together; see saveDay.
        */}
        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <h2 className="text-[15px] font-semibold tracking-tight text-text">
            Activities
          </h2>

          {activities && activities.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-surface p-3"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[14px] font-medium text-text">
                        {labelFor(bySlug, activity.sport)}
                      </span>
                      {activity.distance_m !== null &&
                      hasDistanceFor(bySlug, activity.sport) ? (
                        <span className="font-mono text-[13px] tabular-nums text-text-muted">
                          {metresToKm(activity.distance_m).toFixed(2)} km
                        </span>
                      ) : null}
                      {activity.duration_s !== null ? (
                        <span className="font-mono text-[13px] tabular-nums text-text-muted">
                          {formatDurationClock(activity.duration_s)}
                        </span>
                      ) : null}
                      {activity.avg_pace_s_per_km !== null &&
                      hasDistanceFor(bySlug, activity.sport) ? (
                        <span className="font-mono text-[13px] tabular-nums text-accent">
                          {formatPace(activity.avg_pace_s_per_km)} /km
                        </span>
                      ) : null}
                    </div>
                    {activity.notes ? (
                      <p className="text-[13px] text-text-muted">
                        {activity.notes}
                      </p>
                    ) : null}
                  </div>

                  {/* A submit button of the day form rather than a form of its
                      own. Its own form would submit only itself, throwing away
                      unsaved day edits and a half-typed activity — the same
                      data loss as item 1. A button only sends its name and
                      value when it is the one that submitted, so Save day
                      stays unaffected while this carries the row's id.

                      The id is rendered beside the row it belongs to, from the
                      same server render, so the two cannot disagree. */}
                  <button
                    type="submit"
                    form="day"
                    name="remove_activity"
                    value={activity.id}
                    className="cursor-pointer rounded-md border border-border px-3 py-2 text-[12px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={label}>Nothing logged for this date yet.</p>
          )}

          <div
            data-activity-entry
            className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4"
          >

            <div className="flex flex-col gap-2">
              <label htmlFor="sport" className={label}>
                Sport
              </label>
              {/* Not required, and the placeholder not disabled: an empty entry
                  is the normal case when saving the day, and a disabled option
                  submits nothing at all rather than a blank. */}
              <select
                id="sport"
                name="sport"
                form="day"
                defaultValue=""
                className={field}
              >
                <option value="">Pick one</option>
                {(sports ?? []).map((sport) => (
                  <option
                    key={sport.slug}
                    value={sport.slug}
                    data-no-distance={sport.has_distance ? undefined : ""}
                  >
                    {sport.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <div data-distance className="flex flex-1 flex-col gap-2">
                <label htmlFor="distance_km" className={label}>
                  Distance, km
                </label>
                <input
                  id="distance_km"
                  name="distance_km"
                  form="day"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className={`${field} font-mono tabular-nums`}
                />
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor="duration_clock" className={label}>
                  Duration (mm:ss)
                </label>
                <input
                  id="duration_clock"
                  name="duration_clock"
                  form="day"
                  type="text"
                  placeholder="32:29"
                  className={`${field} font-mono tabular-nums`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {/* The day form already owns "notes", as both id and field name. */}
              <label htmlFor="activity_notes" className={label}>
                Notes
              </label>
              <input
                id="activity_notes"
                name="activity_notes"
                form="day"
                type="text"
                maxLength={2000}
                className={field}
              />
            </div>

            <button
              type="submit"
              form="day"
              className="w-full cursor-pointer rounded-md border border-border bg-surface px-4 py-3 text-[15px] font-medium text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Add activity
            </button>
          </div>
        </div>
        {/*
          Adding a sport is its own form, and its own concern: it changes the
          vocabulary rather than the day. It sits last because logging is the
          common path and this is occasional, and it cannot sit inside the day
          form regardless, since HTML forbids nested forms.

          Submitting reloads the page, so the select above re-renders with the
          new sport already in it.
        */}
        <details className="border-t border-border pt-6">
          <summary className={`${label} cursor-pointer`}>
            Add a sport
          </summary>

          <form
            action={addSport}
            className="mt-4 flex flex-col gap-4 rounded-md border border-border bg-surface p-4"
          >
            <input type="hidden" name="date" value={date} />

            <div className="flex flex-col gap-2">
              <label htmlFor="sport_label" className={label}>
                Name
              </label>
              <input
                id="sport_label"
                name="label"
                type="text"
                required
                maxLength={40}
                placeholder="Badminton"
                className={field}
              />
            </div>

            <label
              htmlFor="sport_has_distance"
              className="flex items-center gap-3 text-[14px] text-text"
            >
              <input
                id="sport_has_distance"
                name="has_distance"
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
              />
              This sport covers a distance
            </label>

            <button
              type="submit"
              className="w-full cursor-pointer rounded-md border border-border bg-surface px-4 py-3 text-[15px] font-medium text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Add sport
            </button>
          </form>
        </details>

      </div>
    </main>
  );
}
