"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { todayIn } from "@/lib/dates";
import { createClient, getClaims } from "@/lib/supabase/server";

/** Postgres uuid, as rendered alongside each expense row. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORIES = [
  "food",
  "groc",
  "travel",
  "shop",
  "bills",
  "fun",
  "health",
  "other",
] as const;

export type ExpenseCategory = (typeof CATEGORIES)[number];

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
  category: z.enum(CATEGORIES),
  note: z
    .string()
    .trim()
    .max(80, "Keep the note under 80 characters.")
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

const setWeeklyBudgetSchema = z.object({
  amount: z.coerce
    .number()
    .int("Budget must be a whole number of rupees.")
    .positive("Budget must be above zero."),
});

export async function setWeeklyBudget(amount: number) {
  const { supabase, userId } = await requireUser();

  const parsed = setWeeklyBudgetSchema.safeParse({ amount });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Budget not saved." };
  }

  const { error } = await supabase.from("spend_settings").upsert(
    {
      user_id: userId,
      weekly_budget: parsed.data.amount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: `Budget not saved. ${error.message}` };
  }

  revalidatePath("/spend");
}
