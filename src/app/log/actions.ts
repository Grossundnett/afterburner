"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { BLOCKER_CODES } from "@/lib/blockers";
import { slugify } from "@/lib/sports";
import { createClient, getClaims } from "@/lib/supabase/server";
import { kmToMetres, paceSecondsPerKm } from "@/lib/units";

/** Postgres uuid, as rendered alongside each activity row. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An HTML date input always submits YYYY-MM-DD. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A time input submits HH:MM, or HH:MM:SS in some browsers. */
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

/** A duration typed the way a watch displays it: mm:ss. Minutes can run past
 *  59 (a long ride is "95:00"), seconds cannot. */
const CLOCK_DURATION = /^\d{1,4}:[0-5]\d$/;

/**
 * FormData hands back "" for an untouched input, which is not the same thing as
 * a value. Everything optional goes through this first so the rest of the
 * schema only ever deals with a real value or null.
 */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optional = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess(blankToNull, inner.nullable());

/**
 * Blank AND zero both mean "not recorded", for quantities that cannot
 * legitimately be zero.
 *
 * Nobody runs zero kilometres, trains for zero minutes or weighs zero
 * kilograms, so a typed 0 is a person saying "none" rather than reporting a
 * measurement. Rejecting it is pedantry that blocks a real entry — a gym
 * session genuinely has no distance.
 *
 * This is deliberately NOT the rule everywhere. A count where zero is a real
 * observation must store the zero: ARCHITECTURE.md section 6 makes the point
 * that "dips — not able to do any" is reps = 0, which is data, not absence.
 * Use `optional` for those.
 *
 * A negative number is still an error rather than null, because that is a typo
 * rather than an intention.
 */
const blankOrZeroToNull = (value: unknown) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Anything non-numeric falls through to the number parser so it produces a
  // real validation message instead of being silently swallowed as null.
  return Number(trimmed) === 0 ? null : trimmed;
};

const measurement = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess(blankOrZeroToNull, inner.nullable());

const dayFormSchema = z.object({
  date: z.string().regex(DATE, "Pick a valid date."),

  // The date the page was rendered for. See the assertion below.
  loaded_date: z.string().regex(DATE).nullable().catch(null),

  // Present only when a row's Remove button was the one that submitted. Those
  // buttons belong to this form so that removing keeps unsaved day edits and a
  // half-typed activity, instead of discarding them the way a separate form did.
  remove_activity: z
    .string()
    .regex(UUID)
    .nullable()
    .catch(null),

  wake_time: optional(z.string().regex(TIME, "Wake time must be HH:MM.")),
  sleep_time: optional(z.string().regex(TIME, "Sleep time must be HH:MM.")),
  blocker_code: optional(z.enum(BLOCKER_CODES)),
  blocker_note: optional(z.string().max(500)),
  notes: optional(z.string().max(2000)),

  weight_kg: measurement(
    z.coerce
      .number()
      .positive("Weight must be a positive number.")
      .max(500, "Weight must be under 500 kg."),
  ),

  // The activity entry fields submit with the day. Sport is optional here
  // because an untouched entry is the normal case; saveDay requires it only
  // once any other activity field holds data.
  // Validated against the user's own sports rather than a fixed enum, since
  // the list is theirs to extend. The composite foreign key is the real
  // enforcement; the lookup below turns a violation into a readable message
  // and supplies has_distance at the same time.
  sport: optional(z.string().min(1).max(40)),

  // Zero means none here, same as blank. Named for the units a person types;
  // the conversion into stored metres and seconds happens in saveDay — the
  // boundary between the form's units and the domain's.
  distance_km: measurement(
    z.coerce
      .number()
      .positive("Distance must be a positive number.")
      .max(1000, "Distance must be under 1000 km."),
  ),
  // Typed as mm:ss off a watch — "32:29" — and converted straight to the
  // stored unit, seconds, rather than through decimal minutes. "00:00" means
  // not recorded, same as blank, matching the zero-is-blank rule for
  // distance and weight above.
  duration_clock: z
    .preprocess(blankToNull, z.string().nullable())
    .refine(
      (v) => v === null || CLOCK_DURATION.test(v.trim()),
      "Duration must be mm:ss, e.g. 32:29.",
    )
    .transform((v) => {
      if (v === null) return null;
      const [minutes, seconds] = v.trim().split(":").map(Number);
      const total = minutes * 60 + seconds;
      return total === 0 ? null : total;
    })
    .refine(
      (v) => v === null || v <= 86_400,
      "Duration must be under 24 hours.",
    ),

  // Not "notes": the day form already submits a field by that name.
  activity_notes: optional(z.string().max(2000)),
});

function backToForm(date: string, params: Record<string, string>): never {
  const search = new URLSearchParams({ date, ...params });
  redirect(`/log?${search.toString()}`);
}

/**
 * Saves one day, and the activity being typed if there is one.
 *
 * Everything on screen is saved by either button. The activity entry fields
 * belong to this form (via the HTML `form` attribute, since they render below
 * the activity list and its Remove forms, and forms cannot nest). When they
 * were a separate form, pressing Save day with a run typed in discarded the
 * run — and pressing Add activity discarded any unsaved day edits.
 *
 * Re-saving cannot duplicate an activity: the entry fields always render
 * empty, so a submitted activity is always one typed since the last save.
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
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/log")}`);
  }

  const supabase = await createClient();

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

  // Anything typed in the activity fields means an activity to save. Checked
  // before any write, so a missing sport refuses the whole save rather than
  // leaving the day written and the activity silently dropped.
  const hasActivity =
    form.sport !== null ||
    form.distance_km !== null ||
    form.duration_clock !== null ||
    form.activity_notes !== null;

  if (hasActivity && form.sport === null) {
    backToForm(form.date, {
      error: "Nothing was saved. The activity needs a sport.",
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

  // The activity is attempted even if the weight failed. A failed weight is
  // one number to retype; a skipped activity is the whole entry, lost.
  let activityError: { message: string } | null = null;

  if (form.sport !== null) {
    // Whether a sport carries a distance is now a column, so this both
    // validates the slug against the user's list and answers that question.
    const { data: sport } = await supabase
      .from("sports")
      .select("has_distance")
      .eq("user_id", userId)
      .eq("slug", form.sport)
      .maybeSingle();

    if (!sport) {
      backToForm(form.date, {
        error: "Day saved. That sport is not in your list.",
      });
    }

    // A distance on a gym or yoga entry was typed before the sport changed and
    // the field hid itself; the browser still submits it.
    const distanceMetres =
      form.distance_km === null || !sport.has_distance
        ? null
        : kmToMetres(form.distance_km);
    const durationSeconds = form.duration_clock;

    ({ error: activityError } = await supabase.from("activities").insert({
      user_id: userId,
      date: form.date,
      sport: form.sport,
      distance_m: distanceMetres,
      duration_s: durationSeconds,
      avg_pace_s_per_km: paceSecondsPerKm(distanceMetres, durationSeconds),
      notes: form.activity_notes,
    }));
  }

  // Removal last, so a row is only dropped once everything meant to be kept
  // has been written. Filtered by user_id as well as id: RLS would refuse
  // another user's row anyway, but a delete keyed solely on a guessable id is
  // the wrong habit to carry into phase 4's share tokens.
  let removeError: { message: string } | null = null;

  if (form.remove_activity !== null) {
    ({ error: removeError } = await supabase
      .from("activities")
      .delete()
      .eq("id", form.remove_activity)
      .eq("user_id", userId));
  }

  if (weightError || activityError || removeError) {
    const failures = [
      weightError ? `Weight not saved. ${weightError.message}` : null,
      activityError ? `Activity not added. ${activityError.message}` : null,
      removeError ? `Activity not removed. ${removeError.message}` : null,
    ].filter(Boolean);
    backToForm(form.date, { error: `Day saved. ${failures.join(" ")}` });
  }

  backToForm(form.date, {
    saved: "1",
    ...(form.sport !== null ? { added: "1" } : {}),
    ...(form.remove_activity !== null ? { removed: "1" } : {}),
  });
}

const addSportSchema = z.object({
  date: z.string().regex(DATE, "Pick a valid date."),
  label: z
    .string()
    .trim()
    .min(1, "Give the sport a name.")
    .max(40, "Keep the name under 40 characters."),
  // An unchecked checkbox submits nothing at all, so absence is false.
  has_distance: z.literal("on").nullable().catch(null),
});

/**
 * Adds a sport to the signed-in user's list.
 *
 * PHASE2.md item 9 asked for a way to add activities without code changes, and
 * item 3 is the same complaint: being sent to the dashboard to add "walk" was
 * the friction, not the missing row. This is the form that removes it.
 *
 * New sports get position 110 so they sort after the seeded set, which ends at
 * 100 with Other. Within that they order by creation, which is the only order
 * that means anything for a list someone builds themselves.
 */
export async function addSport(formData: FormData) {
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/log")}`);
  }

  const supabase = await createClient();

  const parsed = addSportSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fallback = formData.get("date");
    backToForm(typeof fallback === "string" ? fallback : "", {
      error: parsed.error.issues[0]?.message ?? "That sport could not be added.",
    });
  }

  const { date, label, has_distance } = parsed.data;
  const slug = slugify(label);

  if (slug === "") {
    backToForm(date, { error: "That name has no letters or numbers in it." });
  }

  const { error } = await supabase.from("sports").insert({
    user_id: userId,
    slug,
    label,
    has_distance: has_distance !== null,
    position: 110,
  });

  if (error) {
    // 23505 is a unique violation: the slug already exists for this user. Two
    // labels can slugify to the same thing, so say which name it collided with
    // rather than reporting a constraint.
    backToForm(date, {
      error:
        error.code === "23505"
          ? `You already have a sport stored as "${slug}".`
          : `Sport not added. ${error.message}`,
    });
  }

  backToForm(date, { sport_added: "1" });
}
