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

  const { error } = await supabase.from("expenses").insert({
    user_id: userId,
    amount: parsed.data.amount,
    category: parsed.data.category,
    note: parsed.data.note,
    spent_on: parsed.data.spentOn,
  });

  if (error) {
    return { error: `Nothing was saved. ${error.message}` };
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
  amount: z.coerce.number().positive(),
});

/** "This week's move" — shifts budget between two buckets on the current
 * cycle's plan, YNAB-style. Edits the stored per-week (weekly kind) or
 * per-month (monthly kind) figure directly; there's no separate "available"
 * ledger here, so moving money permanently reduces the donor's template
 * budget rather than borrowing from cash left over this period only. */
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
    .select("category_budgets")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  if (!plan) {
    return { error: "No plan for this cycle yet." };
  }

  const budgets = { ...(plan.category_budgets as Record<string, number>) };
  const fromBudget = budgets[parsed.data.from] ?? 0;
  const toBudget = budgets[parsed.data.to] ?? 0;
  const moved = Math.min(parsed.data.amount, fromBudget);

  budgets[parsed.data.from] = Math.round((fromBudget - moved) * 100) / 100;
  budgets[parsed.data.to] = Math.round((toBudget + moved) * 100) / 100;

  const { error } = await supabase
    .from("spend_month_plans")
    .update({ category_budgets: budgets })
    .eq("user_id", userId)
    .eq("month", month);

  if (error) {
    return { error: `Budget not moved. ${error.message}` };
  }

  revalidatePath("/spend");
}

