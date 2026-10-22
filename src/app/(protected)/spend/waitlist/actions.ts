"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { todayIn } from "@/lib/dates";
import { createClient, getClaims } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect(`/login?next=${encodeURIComponent("/spend/waitlist")}`);
  const supabase = await createClient();
  return { supabase, userId };
}

const addToWaitlistSchema = z.object({
  item: z.string().trim().min(1, "Describe what this is.").max(200),
  category: z.string().min(1, "Pick a category.").max(200),
  price: z.coerce
    .number()
    .positive("Enter an amount above zero.")
    .max(10_000_000)
    .transform((n) => Math.round(n * 100) / 100),
});

export type AddToWaitlistInput = z.input<typeof addToWaitlistSchema>;

/** Adds an item to the 48-hour pause instead of logging it as spend
 * straight away. Nothing here enforces the pause itself — `decideWaitlist`
 * is what checks 48 hours have actually elapsed before letting Buy through. */
export async function addToWaitlist(
  input: AddToWaitlistInput,
): Promise<{ error: string } | undefined> {
  const { supabase, userId } = await requireUser();

  const parsed = addToWaitlistSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not add to the waitlist." };
  }

  const { data, error } = await supabase
    .from("wait_list")
    .insert({
      user_id: userId,
      item: parsed.data.item,
      category: parsed.data.category,
      price: parsed.data.price,
    })
    .select();

  if (error) {
    return { error: `Not added. ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "Not added — the database accepted no error but returned no row." };
  }

  revalidatePath("/spend");
  revalidatePath("/spend/waitlist");
}

const decideWaitlistSchema = z.object({
  id: z.string().regex(UUID, "That item could not be found."),
  decision: z.enum(["bought", "dropped"]),
});

/** Buy logs the real spend (today, Apex) and marks the row bought; Drop just
 * marks it dropped. Both are refused server-side if the 48 hours haven't
 * actually elapsed yet — the waitlist page hides the buttons until then,
 * but a hidden button is UI, not enforcement. */
export async function decideWaitlist(
  input: { id: string; decision: "bought" | "dropped" },
): Promise<{ error: string } | undefined> {
  const { supabase, userId } = await requireUser();

  const parsed = decideWaitlistSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not record that decision." };
  }

  const { data: row } = await supabase
    .from("wait_list")
    .select("item, category, price, added_at, decision")
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) {
    return { error: "That item could not be found." };
  }
  if (row.decision !== "pending") {
    return { error: "That item was already decided." };
  }

  const hoursWaited = (Date.now() - new Date(row.added_at).getTime()) / 3_600_000;
  if (hoursWaited < 48) {
    return { error: "The 48 hours aren't up yet." };
  }

  if (parsed.data.decision === "bought") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    const today = todayIn(profile?.timezone ?? "UTC");

    const { data: expenseRow, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        amount: row.price,
        category: row.category,
        note: row.item,
        spent_on: today,
        account: "Apex",
      })
      .select();

    if (expenseError) {
      return { error: `Not saved. ${expenseError.message}` };
    }
    if (!expenseRow || expenseRow.length === 0) {
      return { error: "Not saved — the database accepted no error but returned no row." };
    }
  }

  const { data, error } = await supabase
    .from("wait_list")
    .update({ decision: parsed.data.decision, decided_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .select();

  if (error) {
    return { error: `Not saved. ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "Not saved — the database accepted no error but returned no row." };
  }

  revalidatePath("/spend");
  revalidatePath("/spend/waitlist");
}
