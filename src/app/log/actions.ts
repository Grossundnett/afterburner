"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { BLOCKER_CODES } from "@/lib/blockers";
import { createClient } from "@/lib/supabase/server";

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

  // The date the form was rendered for. See `showing` below — this is what
  // stops a blank field wiping data belonging to a date you never saw.
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

  /**
   * True when this submit is editing the same date the form was rendered with,
   * which is the only situation where we know the person saw the stored values.
   *
   * When it is true a blank field means "clear this". When it is false — they
   * changed the date picker to a date whose contents were never displayed —
   * blanks are left alone instead, so fiddling with the date cannot silently
   * erase another day's entry.
   */
  const showing = form.loaded_date === form.date;

  const dayRow = {
    user_id: userId,
    date: form.date,
    ...(showing || form.wake_time !== null
      ? { wake_time: form.wake_time }
      : {}),
    ...(showing || form.sleep_time !== null
      ? { sleep_time: form.sleep_time }
      : {}),
    ...(showing || form.blocker_code !== null
      ? { blocker_code: form.blocker_code }
      : {}),
    ...(showing || form.blocker_note !== null
      ? { blocker_note: form.blocker_note }
      : {}),
    ...(showing || form.notes !== null ? { notes: form.notes } : {}),
  };

  const { error: dayError } = await supabase
    .from("days")
    .upsert(dayRow, { onConflict: "user_id,date" });

  if (dayError) {
    backToForm(form.date, { error: `Nothing was saved. ${dayError.message}` });
  }

  // Weight only touches body_metrics when there is something to do. Upsert when
  // a value was given; clear with an update when the field was emptied on a
  // date we were showing. Update rather than upsert, because upserting a null
  // weight would create an otherwise empty row for a date never weighed.
  let weightError: string | null = null;

  if (form.weight_kg !== null) {
    const { error } = await supabase
      .from("body_metrics")
      .upsert(
        { user_id: userId, date: form.date, weight_kg: form.weight_kg },
        { onConflict: "user_id,date" },
      );
    weightError = error?.message ?? null;
  } else if (showing) {
    const { error } = await supabase
      .from("body_metrics")
      .update({ weight_kg: null })
      .eq("user_id", userId)
      .eq("date", form.date);
    weightError = error?.message ?? null;
  }

  if (weightError) {
    backToForm(form.date, {
      error: `Day saved. Weight could not be saved. ${weightError}`,
    });
  }

  backToForm(form.date, { saved: "1" });
}
