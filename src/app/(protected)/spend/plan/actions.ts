"use server";

import { z } from "zod";
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
  buffer: z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100),
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

  const { month, salary, investments, savings_target, buffer, category_budgets } = parsed.data;

  const { error } = await supabase.from("spend_month_plans").upsert(
    {
      user_id: userId,
      month,
      salary,
      investments,
      savings_target,
      buffer,
      category_budgets,
    },
    { onConflict: "user_id,month" },
  );

  if (error) {
    return { error: `Plan not saved. ${error.message}` };
  }
}
