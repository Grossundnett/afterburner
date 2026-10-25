"use server";

import { z } from "zod";
import { ACCOUNTS } from "@/lib/accounts";
import { CATEGORY_SUB_LABELS } from "@/lib/spend-categories";
import { createClient, getClaims } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const DATE_MONTH = /^\d{4}-\d{2}$/;

async function requireUser() {
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect(`/login?next=${encodeURIComponent("/spend/plan")}`);
  const supabase = await createClient();
  return { supabase, userId };
}

const saveMonthPlanSchema = z.object({
  month: z.string().regex(DATE_MONTH, "Invalid month."),
  salary: z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100),
  investments: z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100),
  savings_target: z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100),
  shopping_accrual: z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100),
  category_budgets: z.record(z.string(), z.number().min(0)),
});

export type SaveMonthPlanInput = z.input<typeof saveMonthPlanSchema>;

export async function saveMonthPlan(
  input: SaveMonthPlanInput,
): Promise<{ error: string } | undefined> {
  const { supabase, userId } = await requireUser();

  const parsed = saveMonthPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Plan could not be saved." };
  }

  const { month, salary, investments, savings_target, shopping_accrual, category_budgets } = parsed.data;

  // Shopping's four sub-budgets are its only budget — they must add up to
  // exactly what accrues into the fund each month, or money either goes
  // unaccounted for or the sub-budgets promise more than the fund will
  // ever hold.
  const shoppingSubTotal = CATEGORY_SUB_LABELS["Shopping"].reduce(
    (sum, label) => sum + (category_budgets[`Shopping:${label}`] ?? 0),
    0,
  );
  const shoppingGap = Math.round((shopping_accrual - shoppingSubTotal) * 100) / 100;
  if (Math.abs(shoppingGap) > 0.01) {
    return {
      error:
        shoppingGap > 0
          ? `Shopping's sub-budgets are ₹${shoppingGap.toFixed(2)} short of the accrual. Raise a sub-budget or lower the accrual.`
          : `Shopping's sub-budgets are ₹${Math.abs(shoppingGap).toFixed(2)} over the accrual. Lower a sub-budget or raise the accrual.`,
    };
  }

  const { data, error } = await supabase
    .from("spend_month_plans")
    .upsert(
      {
        user_id: userId,
        month,
        salary,
        investments,
        savings_target,
        shopping_accrual,
        category_budgets,
      },
      { onConflict: "user_id,month" },
    )
    .select();

  if (error) {
    return { error: `Plan not saved. ${error.message}` };
  }
  // Every mutation here forces the row back with .select(). A write that
  // reports no error but no row either (RLS silently filtering the result,
  // a conflict target that doesn't match a real constraint) is still a
  // failure — three rounds were lost to exactly this kind of silent miss.
  if (!data || data.length === 0) {
    return { error: "Plan not saved — the database accepted no error but returned no row." };
  }
}

const recordBalanceSchema = z.object({
  account: z.enum(ACCOUNTS),
  amount: z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100),
});

export type RecordBalanceInput = z.input<typeof recordBalanceSchema>;

/** Records a new balance snapshot. Never updates a prior one — a snapshot is
 * a point-in-time fact, and get_dashboard() always reads the latest row per
 * account, so history stays intact for later auditing. */
export async function recordBalance(
  input: RecordBalanceInput,
): Promise<
  | { error: string; account?: undefined; amount?: undefined; snapshot_at?: undefined }
  | { error: null; account: string; amount: number; snapshot_at: string }
> {
  const { supabase, userId } = await requireUser();

  const parsed = recordBalanceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Balance not saved." };
  }

  const { data, error } = await supabase
    .from("spend_balances")
    .insert({
      user_id: userId,
      account: parsed.data.account,
      amount: parsed.data.amount,
    })
    .select("account, amount, snapshot_at");

  if (error) {
    console.error(`[recordBalance] ${parsed.data.account} ${parsed.data.amount}:`, error);
    return { error: `Balance not saved. ${error.message}` };
  }
  const row = data?.[0];
  if (!row) {
    console.error(
      `[recordBalance] ${parsed.data.account} ${parsed.data.amount}: insert returned no row and no error.`,
    );
    return { error: "Balance not saved — the database accepted no error but returned no row." };
  }
  return { error: null, account: row.account, amount: Number(row.amount), snapshot_at: row.snapshot_at };
}

export async function setCountBobAsCash(
  value: boolean,
): Promise<{ error: string } | undefined> {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("spend_settings")
    .upsert(
      { user_id: userId, count_bob_as_cash: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select();

  if (error) {
    return { error: `Setting not saved. ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "Setting not saved — the database accepted no error but returned no row." };
  }
}
