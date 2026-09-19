"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { BLOCKER_CODES } from "@/lib/blockers";
import { SPORTS } from "@/lib/sports";
import { createClient } from "@/lib/supabase/server";
import {
  kmToMetres,
  minutesToSeconds,
  paceSecondsPerKm,
} from "@/lib/units";

/** Postgres uuid, as rendered alongside each activity row. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An HTML date input always submits YYYY-MM-DD. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A time input submits HH:MM, or HH:MM:SS in some browsers. */
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * FormData hands back "" for an untouched input, which is not the same thing as
 * a value. Everything optional goes through this first so the rest of the
 * schema only ever deals with a real value or null.
 */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optional = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess(blankToNull, inner.nullable());

const dayFormSchema = z.object({
  date: z.string().regex(DATE, "Pick a valid date."),

  // The date the page was rendered for. See the assertion below.
  loaded_date: z.string().regex(DATE).nullable().catch(null),

  wake_time: optional(z.string().regex(TIME, "Wake time must be HH:MM.")),
  sleep_time: optional(z.string().regex(TIME, "Sleep time must be HH:MM.")),
  blocker_code: optional(z.enum(BLOCKER_CODES)),
  blocker_note: optional(z.string().max(500)),
  notes: optional(z.string().max(2000)),

  weight_kg: optional(
    z.coerce
      .number()
      .positive("Weight must be a positive number.")
      .max(500, "Weight must be under 500 kg."),
  ),
});

function backToForm(date: string, params: Record<string, string>): never {
  const search = new URLSearchParams({ date, ...params });
  redirect(`/log?${search.toString()}`);
}

/**
 * Saves one day.
 *
 * Writes day fields to `days` and weight to `body_metrics` — two tables, two
 * requests, and deliberately NOT one transaction. PostgREST offers no
 * cross-table transaction from the client; the only atomic option is a Postgres
 * function, which is a migration and a second home for write logic.
 *
 * It is safe without one because both writes are idempotent upserts keyed on
 * (user_id, date): a partial failure cannot duplicate or corrupt anything, only
 * leave one row unwritten, and resubmitting the same form repairs it. The one
 * case worth wording precisely is the day saving while the weight does not —
 * reporting that as a flat failure is how you end up entering a day twice.
 *
 * Blank clears. That is only safe because the page renders every field from the
 * stored row for one date, and the date is not editable inside this form — it
 * arrives as a hidden field matching what was rendered. Changing date is a
 * separate GET form that navigates and re-renders.
 */
export async function saveDay(formData: FormData) {
  // Auth first, before parsing anything. Server Actions are POSTs to whatever
  // route they are used on rather than routes of their own, so the proxy
  // matcher does not cover them. RLS would refuse a forged user_id via its
  // with-check clause, but relying on that yields a confusing database error
  // instead of a clean redirect, and cannot tell "signed out" from "bug".
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/log")}`);
  }

  const parsed = dayFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const fallbackDate = formData.get("date");
    backToForm(typeof fallbackDate === "string" ? fallbackDate : "", {
      error: first?.message ?? "Those values could not be saved.",
    });
  }

  const form = parsed.data;

  // The page renders one date and submits that same date in a hidden field, so
  // these always agree. If they do not, the values on screen belonged to some
  // other day and saving them here would copy one record onto another. Refuse,
  // and re-render the submitted date so the correct values are shown instead.
  if (form.loaded_date !== form.date) {
    backToForm(form.date, {
      error: "The form was showing a different date. Check these values before saving.",
    });
  }

  const { error: dayError } = await supabase.from("days").upsert(
    {
      user_id: userId,
      date: form.date,
      wake_time: form.wake_time,
      sleep_time: form.sleep_time,
      blocker_code: form.blocker_code,
      blocker_note: form.blocker_note,
      notes: form.notes,
    },
    { onConflict: "user_id,date" },
  );

  if (dayError) {
    backToForm(form.date, { error: `Nothing was saved. ${dayError.message}` });
  }

  // Upsert when a weight was given; clear with an update when the field was
  // emptied. Update rather than upsert for the clear, because upserting a null
  // weight would create an otherwise empty row for a date never weighed.
  const { error: weightError } =
    form.weight_kg !== null
      ? await supabase.from("body_metrics").upsert(
          { user_id: userId, date: form.date, weight_kg: form.weight_kg },
          { onConflict: "user_id,date" },
        )
      : await supabase
          .from("body_metrics")
          .update({ weight_kg: null })
          .eq("user_id", userId)
          .eq("date", form.date);

  if (weightError) {
    backToForm(form.date, {
      error: `Day saved. Weight could not be saved. ${weightError.message}`,
    });
  }

  backToForm(form.date, { saved: "1" });
}

const activityFormSchema = z.object({
  date: z.string().regex(DATE, "Pick a valid date."),
  loaded_date: z.string().regex(DATE).nullable().catch(null),

  sport: z.enum(SPORTS, { message: "Pick a sport." }),

  // Named for the units a person types. The conversion into stored metres and
  // seconds happens below, in this action — the boundary between the form's
  // units and the domain's. Keeping the field names honest about what they hold
  // is worth more than converting a line earlier inside the schema.
  distance_km: optional(
    z.coerce
      .number()
      .positive("Distance must be a positive number.")
      .max(1000, "Distance must be under 1000 km."),
  ),
  duration_min: optional(
    z.coerce
      .number()
      .positive("Duration must be a positive number.")
      .max(1440, "Duration must be under 24 hours."),
  ),

  notes: optional(z.string().max(2000)),
});

/**
 * Adds one activity to a date.
 *
 * Separate from saveDay, and necessarily so. `days` is keyed on
 * (user_id, date) so its write is an idempotent upsert; `activities` has no
 * such key, because you can legitimately run twice in one day, so its write is
 * an insert. Sharing a form would mean every re-save of the day duplicated
 * every activity.
 *
 * Duplicate protection is post/redirect/get: this POSTs and then redirects, so
 * refreshing or going back re-runs the GET rather than replaying the insert.
 * Double-tapping the button will still create two rows — there is no way to
 * disable a button without client JavaScript — but they are visible and one
 * tap removes the extra.
 */
export async function addActivity(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/log")}`);
  }

  const parsed = activityFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const fallbackDate = formData.get("date");
    backToForm(typeof fallbackDate === "string" ? fallbackDate : "", {
      error: first?.message ?? "That activity could not be added.",
    });
  }

  const form = parsed.data;

  // Same assertion as the day form: the page renders one date and submits it
  // hidden, so these agree unless something went wrong.
  if (form.loaded_date !== form.date) {
    backToForm(form.date, {
      error: "The form was showing a different date. Check the values before adding.",
    });
  }

  const distanceMetres =
    form.distance_km === null ? null : kmToMetres(form.distance_km);
  const durationSeconds =
    form.duration_min === null ? null : minutesToSeconds(form.duration_min);

  const { error } = await supabase.from("activities").insert({
    user_id: userId,
    date: form.date,
    sport: form.sport,
    distance_m: distanceMetres,
    duration_s: durationSeconds,
    avg_pace_s_per_km: paceSecondsPerKm(distanceMetres, durationSeconds),
    notes: form.notes,
  });

  if (error) {
    backToForm(form.date, { error: `Activity not added. ${error.message}` });
  }

  backToForm(form.date, { added: "1" });
}

/**
 * Removes one activity.
 *
 * Deletes immediately with no confirmation step, which is a deliberate choice:
 * without client JavaScript a confirm dialog means a second round trip and a
 * second screen, and re-entering an activity takes about ten seconds.
 *
 * Filtered by user_id as well as id. RLS would refuse someone else's row
 * anyway, but the query should be correct on its own terms rather than only
 * because the database rescues it — and a delete filtered solely by a guessable
 * id is the wrong habit to build before phase 4 adds share tokens.
 */
export async function removeActivity(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/log")}`);
  }

  const rawId = formData.get("id");
  const rawDate = formData.get("date");

  const id = typeof rawId === "string" && UUID.test(rawId) ? rawId : null;
  const date =
    typeof rawDate === "string" && DATE.test(rawDate) ? rawDate : null;

  if (!id || !date) {
    backToForm(date ?? "", { error: "That activity could not be removed." });
  }

  const { error } = await supabase
    .from("activities")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    backToForm(date, { error: `Activity not removed. ${error.message}` });
  }

  backToForm(date, { removed: "1" });
}
