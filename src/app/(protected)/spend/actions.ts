"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { todayIn, cycleMonth } from "@/lib/dates";
import { createClient, getClaims } from "@/lib/supabase/server";

/** Postgres uuid, as rendered alongside each expense row. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Category keys are free text validated against the user's spend_categories. */
export type ExpenseCategory = string;

/** Called from a Client Component, so every action authenticates itself —
 * the proxy matcher protects pages, not the Server Actions mounted on them. */
async function requireUser() {
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/spend")}`);
  }

  const supabase = await createClient();

  return { supabase, userId };
}

const ACCOUNTS = ["Apex", "BOB", "Cash"] as const;

const addExpenseSchema = z.object({
  // Rounded to 2 decimals to match the numeric(10,2) column; a client-side
  // float like 12.345 would otherwise be silently truncated by Postgres
  // rather than rejected.
  amount: z.coerce
    .number()
    .positive("Enter an amount above zero.")
    .max(10_000_000, "That amount is too large.")
    .transform((n) => Math.round(n * 100) / 100),
  category: z.string().min(1, "Pick a category.").max(200),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters.")
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  spentOn: z.string().regex(DATE, "Pick a valid date."),
  // Which account the money came from, for balance drawdown. Defaults to
  // Apex (the DB column default too) so existing callers keep working.
  account: z.enum(ACCOUNTS).optional().default("Apex"),
});

export type AddExpenseInput = z.input<typeof addExpenseSchema>;

export async function addExpense(input: AddExpenseInput) {
  const { supabase, userId } = await requireUser();

  const parsed = addExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That spend could not be added." };
  }

  // Validate category against the user's spend_categories table.
  // This catches any forged or stale key the client might send.
  const { data: catRow } = await supabase
    .from("spend_categories")
    .select("key")
    .eq("user_id", userId)
    .eq("key", parsed.data.category)
    .maybeSingle();

  if (!catRow) {
    return { error: "Pick a valid category." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  // spentOn is a date picked from the current week's day select, so it should
  // never be after today — but it is still a client-supplied string, and the
  // client's idea of "today" is not authoritative.
  const today = todayIn(profile?.timezone ?? "UTC");
  if (parsed.data.spentOn > today) {
    return { error: "That date is in the future." };
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: userId,
      amount: parsed.data.amount,
      category: parsed.data.category,
      note: parsed.data.note,
      spent_on: parsed.data.spentOn,
      account: parsed.data.account,
    })
    .select();

  if (error) {
    return { error: `Nothing was saved. ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "Nothing was saved — the database accepted no error but returned no row." };
  }

  revalidatePath("/spend");
}

const deleteExpenseSchema = z.object({
  id: z.string().regex(UUID, "That spend could not be found."),
});

export async function deleteExpense(id: string) {
  const { supabase, userId } = await requireUser();

  const parsed = deleteExpenseSchema.safeParse({ id });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That spend could not be removed." };
  }

  // Filtered by user_id as well as id: RLS refuses another user's row anyway,
  // but a delete keyed solely on a guessable id is the wrong habit to carry
  // forward.
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", userId);

  if (error) {
    return { error: `Not removed. ${error.message}` };
  }

  revalidatePath("/spend");
}

const BUCKETS = ["Food", "Transport", "Fun", "Subscriptions", "Big Buy", "Other"] as const;

const coverOverspendSchema = z.object({
  from: z.enum(BUCKETS),
  to: z.enum(BUCKETS),
  amount: z.coerce.number().positive().max(10_000_000),
});

/** "This week's move" — shifts budget between two buckets for the CURRENT
 * cycle only, via spend_month_plans.adjustments, never category_budgets.
 * category_budgets is the reusable template a future "copy last month"
 * would carry forward; if Cover edited it directly, every use would ratchet
 * the template down permanently. adjustments is a one-off delta layered on
 * top for this cycle's row only — get_dashboard adds it to the template
 * figure, and a new month's row starts with adjustments back at '{}'. */
export async function coverOverspend(input: {
  from: string;
  to: string;
  amount: number;
}) {
  const { supabase, userId } = await requireUser();

  const parsed = coverOverspendSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not move budget." };
  }
  if (parsed.data.from === parsed.data.to) {
    return { error: "Pick two different buckets." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const today = todayIn(profile?.timezone ?? "UTC");
  const month = cycleMonth(today);

  const { data: plan } = await supabase
    .from("spend_month_plans")
    .select("adjustments")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  if (!plan) {
    return { error: "No plan for this cycle yet." };
  }

  const adjustments = { ...(plan.adjustments as Record<string, number>) };
  const fromAdj = adjustments[parsed.data.from] ?? 0;
  const toAdj = adjustments[parsed.data.to] ?? 0;
  const moved = parsed.data.amount;

  // Decrease the donor's adjustment (can go negative — same as YNAB letting
  // a category go negative when you move out more than it has) and increase
  // the receiver's by the same amount, so the move is a wash on the cycle.
  adjustments[parsed.data.from] = Math.round((fromAdj - moved) * 100) / 100;
  adjustments[parsed.data.to] = Math.round((toAdj + moved) * 100) / 100;

  const { data, error } = await supabase
    .from("spend_month_plans")
    .update({ adjustments })
    .eq("user_id", userId)
    .eq("month", month)
    .select();

  if (error) {
    return { error: `Budget not moved. ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "Budget not moved — the database accepted no error but returned no row." };
  }

  revalidatePath("/spend");
}

