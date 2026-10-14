/**
 * The three accounts Afterburner tracks balances and manual-expense
 * drawdown against. Must match spend_balances' check constraint
 * (`account = ANY (ARRAY['Apex','BOB','Cash'])`) exactly — this is the one
 * place that spelling is defined, so nothing can drift out of sync with it.
 */
export const ACCOUNTS = ["Apex", "BOB", "Cash"] as const;

export type Account = (typeof ACCOUNTS)[number];
