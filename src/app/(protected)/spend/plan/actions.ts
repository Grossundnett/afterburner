"use server";

import { z } from "zod";
import { ACCOUNTS } from "@/lib/accounts";
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
  big_buy_accrual: z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100),
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

  const { month, salary, investments, savings_target, big_buy_accrual, category_budgets } = parsed.data;

  const { data, error } = await supabase
    .from("spend_month_plans")
    .upsert(
      {
        user_id: userId,
        month,
        salary,
        investments,
        savings_target,
        big_buy_accrual,
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
): Promise<{ error: string } | undefined> {
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
    .select();

  if (error) {
    return { error: `Balance not saved. ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "Balance not saved — the database accepted no error but returned no row." };
  }
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
