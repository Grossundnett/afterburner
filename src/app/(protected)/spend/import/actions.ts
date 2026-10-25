"use server";

import { redirect } from "next/navigation";
import { createClient, getClaims } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Wallet category -> this app's six-category model (migration 0018).
// Same mapping 0018_categories.sql's own data migration used for existing
// rows, kept consistent here for every row imported from now on. A Wallet
// category not in this map (or a brand-new one Wallet adds later) falls
// through to Other, flagged via `unlabeled` for visibility — it was never
// silently dropped before, and still isn't.
// ---------------------------------------------------------------------------
const WALLET_CATEGORY_MAP: Record<string, { category: string; subLabel?: string }> = {
  "Meals": { category: "Food", subLabel: "Eating out" },
  "Groceries": { category: "Food", subLabel: "Groceries" },
  "Restaurant, fast-food": { category: "Food", subLabel: "Eating out" },
  "Juices, Drinks": { category: "Food", subLabel: "Snacks & drinks" },
  // "unless clearly an auto" — Wallet's Taxi key doesn't distinguish that,
  // same reasoning 0018's data migration used for existing rows.
  "Taxi": { category: "Transport", subLabel: "Bike taxi" },
  "Public transport": { category: "Transport", subLabel: "Public transport" },
  "Fuel": { category: "Transport" },
  "Parking": { category: "Transport" },
  "Life & Entertainment": { category: "Fun" },
  "Guilty pleasure": { category: "Fun" },
  "Business trips": { category: "Fun" },
  "Software, apps, games": { category: "Subscriptions" },
  "Dating": { category: "Subscriptions" },
  "Active sport, fitness": { category: "Shopping", subLabel: "Fitness gear" },
  "Shopping": { category: "Shopping" },
  "Clothes & Footwear": { category: "Shopping", subLabel: "Clothes & shoes" },
  "Health care, doctor": { category: "Other" },
  "Health and beauty": { category: "Other" },
  "Child Support": { category: "Other" },
  "Charity, gifts": { category: "Other" },
  "Energy, utilities": { category: "Other" },
  "Others": { category: "Other" },
};

// ---------------------------------------------------------------------------
// Column indices (from the Wallet CSV header):
// account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels
// ---------------------------------------------------------------------------
const C = {
  account: 0,
  category: 1,
  amount: 3,
  type: 5,
  note: 7,
  date: 8,
  transfer: 9,
  payee: 10,
} as const;

// ---------------------------------------------------------------------------
// Exception patterns — applied to note + payee, expenses only, before key lookup.
// Priority: guilty > dating > category lookup.
// ---------------------------------------------------------------------------
const GUILTY_RE = /don'?t ask|succumb|gu?ilty pleasure/i;
const DATING_RE = /\b(dating|hinge|bumble|tinder|boo|aisle|pure)\b/i;

// ---------------------------------------------------------------------------
// Shared types (exported so CSVImportClient can import them)
// ---------------------------------------------------------------------------

export type ExpenseImportRow = {
  source_ts: string;      // UTC ISO from CSV
  spent_on: string;       // calendar date in IST
  account: string;
  amount: number;
  category: string;       // one of the six top-level categories
  sub_label: string | null;
  wallet_category: string;
  note: string | null;
  guilty: boolean;
  unlabeled: boolean;
};

export type MoneyMoveImportRow = {
  kind: "income" | "investment" | "transfer";
  source_ts: string;
  account: string;
  amount: number;
  note: string | null;
};

export type GhostRow = {
  id: string;
  source_ts: string;
  account: string;
  amount: number;
  category: string;
};

export type CollisionRow = {
  manualId: string;
  date: string;
  amount: number;
  manualNote: string | null;
  expense: ExpenseImportRow;
};

export type ParsedPreview = {
  rangeStart: string;   // YYYY-MM-DD
  rangeEnd: string;
  expenses: ExpenseImportRow[];
  moneyMoves: MoneyMoveImportRow[];
  ghosts: GhostRow[];
  collisions: CollisionRow[];
  unknownCategories: { label: string; count: number }[];
  expenseTotal: number;
  incomeTotal: number;
  investmentTotal: number;
};

export type CommitResult = {
  expensesInserted: number;
  expensesUpdated: number;
  moneyMovesInserted: number;
  unknownWalletLabels: string[];
  dbExpenseTotal: number;
  parseExpenseTotal: number;
  reconciled: boolean;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseFields(line: string): string[] {
  return line.split(";").map((f) => f.trim().replace(/^"|"$/g, ""));
}

/** UTC ISO → IST calendar date (YYYY-MM-DD). */
function toISTDate(utcIso: string): string {
  return new Date(utcIso).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Kolkata",
  });
}

async function requireUser() {
  const { data: claims } = await getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect(`/login?next=${encodeURIComponent("/spend/import")}`);
  const supabase = await createClient();
  return { supabase, userId };
}

// ---------------------------------------------------------------------------
// previewImport — parses the CSV, queries the DB, returns a preview.
// No writes.
// ---------------------------------------------------------------------------

export async function previewImport(
  rawText: string,
): Promise<{ preview?: ParsedPreview; error?: string }> {
  const { supabase, userId } = await requireUser();

  const lines = rawText.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { error: "No data rows found. Check the pasted or uploaded content." };
  }

  // Validate header
  const headerFields = lines[0].split(";").map((h) => h.trim().toLowerCase());
  const required = ["account", "category", "amount", "type", "note", "date", "transfer"];
  const missing = required.filter((col) => !headerFields.includes(col));
  if (missing.length > 0) {
    return { error: `Unexpected CSV format — missing columns: ${missing.join(", ")}` };
  }

  const expenses: ExpenseImportRow[] = [];
  const moneyMoves: MoneyMoveImportRow[] = [];
  const unknownCounts = new Map<string, number>();

  let expenseTotal = 0;
  let incomeTotal = 0;
  let investmentTotal = 0;

  for (let i = 1; i < lines.length; i++) {
    const f = parseFields(lines[i]);
    if (f.length < 11) continue; // skip malformed rows

    const account = f[C.account];
    const walletCat = f[C.category];
    const amount = parseFloat(f[C.amount]);
    const type = f[C.type];
    const note = f[C.note] || null;
    const source_ts = f[C.date];
    const transfer = f[C.transfer].toLowerCase() === "true";
    const payee = f[C.payee] || null;

    if (!account || isNaN(amount) || !source_ts) continue;

    // --- Classify row ---
    if (transfer) {
      moneyMoves.push({ kind: "transfer", source_ts, account, amount, note });
      continue;
    }
    if (walletCat === "Financial investments") {
      moneyMoves.push({ kind: "investment", source_ts, account, amount, note });
      investmentTotal += amount;
      continue;
    }
    if (type === "Income") {
      moneyMoves.push({ kind: "income", source_ts, account, amount, note });
      incomeTotal += amount;
      continue;
    }

    // --- Expense row: apply exception overrides ---
    const searchText = [note, payee].filter(Boolean).join(" ");
    let category: string;
    let sub_label: string | null = null;
    let guilty = false;
    let unlabeled = false;

    if (GUILTY_RE.test(searchText)) {
      category = "Fun";
      guilty = true;
    } else if (DATING_RE.test(searchText)) {
      category = "Subscriptions";
    } else {
      const mapped = WALLET_CATEGORY_MAP[walletCat];
      if (mapped) {
        category = mapped.category;
        sub_label = mapped.subLabel ?? null;
      } else {
        category = "Other";
        unlabeled = true;
        unknownCounts.set(walletCat, (unknownCounts.get(walletCat) ?? 0) + 1);
      }
    }

    const spent_on = toISTDate(source_ts);
    expenses.push({
      source_ts,
      spent_on,
      account,
      amount,
      category,
      sub_label,
      wallet_category: walletCat,
      note,
      guilty,
      unlabeled,
    });
    expenseTotal += amount;
  }

  if (expenses.length === 0 && moneyMoves.length === 0) {
    return { error: "No rows could be parsed. Check the CSV format." };
  }

  // --- Date range ---
  const allTs = [
    ...expenses.map((e) => e.source_ts),
    ...moneyMoves.map((m) => m.source_ts),
  ].sort();
  const rangeStart = toISTDate(allTs[0]);
  const rangeEnd = toISTDate(allTs[allTs.length - 1]);

  // --- Ghost detection: wallet_csv rows in DB but not in this CSV ---
  const csvKeys = new Set(expenses.map((e) => `${e.source_ts}|${e.account}`));

  const { data: dbRows } = await supabase
    .from("expenses")
    .select("id, source_ts, account, amount, category")
    .eq("user_id", userId)
    .eq("source", "wallet_csv")
    .gte("spent_on", rangeStart)
    .lte("spent_on", rangeEnd);

  const ghosts: GhostRow[] = (dbRows ?? [])
    .filter(
      (r) => r.source_ts && !csvKeys.has(`${r.source_ts}|${r.account}`),
    )
    .map((r) => ({
      id: r.id,
      source_ts: r.source_ts!,
      account: r.account ?? "",
      amount: Number(r.amount),
      category: r.category,
    }));

  // --- Manual collision detection: same date + exact amount, source='manual' ---
  const expenseDates = [...new Set(expenses.map((e) => e.spent_on))];
  const { data: manualRows } = await supabase
    .from("expenses")
    .select("id, spent_on, amount, note")
    .eq("user_id", userId)
    .eq("source", "manual")
    .in("spent_on", expenseDates);

  const collisions: CollisionRow[] = [];
  for (const manual of manualRows ?? []) {
    const manualAmt = Number(manual.amount);
    const match = expenses.find(
      (e) => e.spent_on === manual.spent_on && e.amount === manualAmt,
    );
    if (match) {
      collisions.push({
        manualId: manual.id,
        date: manual.spent_on,
        amount: manualAmt,
        manualNote: manual.note,
        expense: match,
      });
    }
  }

  const unknownCategories = [...unknownCounts.entries()].map(
    ([label, count]) => ({ label, count }),
  );

  return {
    preview: {
      rangeStart,
      rangeEnd,
      expenses,
      moneyMoves,
      ghosts,
      collisions,
      unknownCategories,
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      incomeTotal: Math.round(incomeTotal * 100) / 100,
      investmentTotal: Math.round(investmentTotal * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// commitImport — writes the preview to the DB.
// Expenses: CSV wins on conflict (DO UPDATE).
// MoneyMoves: DO NOTHING on conflict.
// Auto-creates unknown categories in Others group.
// ---------------------------------------------------------------------------

export async function commitImport(
  preview: ParsedPreview,
): Promise<{ result?: CommitResult; error?: string }> {
  const { supabase, userId } = await requireUser();

  const { expenses, moneyMoves, rangeStart, rangeEnd, expenseTotal } = preview;

  // Every row lands under one of the six fixed categories already (an
  // unrecognised Wallet category falls through to Other, flagged via
  // `unlabeled`) — there's no new category to create under 0018's model,
  // unlike the old per-Wallet-key category table this replaced.
  const unknownLabels = [
    ...new Set(expenses.filter((e) => e.unlabeled).map((e) => e.wallet_category)),
  ];

  // Partition expenses into new vs. existing (CSV wins on conflict)
  const { data: existingRows } = await supabase
    .from("expenses")
    .select("source_ts, account")
    .eq("user_id", userId)
    .eq("source", "wallet_csv")
    .gte("spent_on", rangeStart)
    .lte("spent_on", rangeEnd);

  const existingKeys = new Set(
    (existingRows ?? [])
      .filter((r) => r.source_ts)
      .map((r) => `${r.source_ts}|${r.account}`),
  );

  const toInsert = expenses.filter((e) => !existingKeys.has(`${e.source_ts}|${e.account}`));
  const toUpdate = expenses.filter((e) => existingKeys.has(`${e.source_ts}|${e.account}`));

  // 3. Insert new expense rows
  let expensesInserted = 0;
  if (toInsert.length > 0) {
    const { error } = await supabase.from("expenses").insert(
      toInsert.map((e) => ({
        user_id: userId,
        amount: e.amount,
        category: e.category,
        sub_label: e.sub_label,
        note: e.note,
        spent_on: e.spent_on,
        source: "wallet_csv",
        source_ts: e.source_ts,
        account: e.account,
        wallet_category: e.wallet_category,
        guilty: e.guilty,
        unlabeled: e.unlabeled,
      })),
    );
    if (error) return { error: `Insert failed: ${error.message}` };
    expensesInserted = toInsert.length;
  }

  // 4. Update existing expense rows (CSV wins)
  let expensesUpdated = 0;
  for (const e of toUpdate) {
    const { error } = await supabase
      .from("expenses")
      .update({
        category: e.category,
        sub_label: e.sub_label,
        amount: e.amount,
        note: e.note,
        wallet_category: e.wallet_category,
        guilty: e.guilty,
        unlabeled: e.unlabeled,
      })
      .eq("user_id", userId)
      .eq("source", "wallet_csv")
      .eq("source_ts", e.source_ts)
      .eq("account", e.account);
    if (error) return { error: `Update failed: ${error.message}` };
    expensesUpdated++;
  }

  // 5. Insert money_moves (DO NOTHING on conflict)
  let moneyMovesInserted = 0;
  if (moneyMoves.length > 0) {
    const { data: existingMoves } = await supabase
      .from("money_moves")
      .select("source_ts, account, kind")
      .eq("user_id", userId)
      .in(
        "source_ts",
        moneyMoves.map((m) => m.source_ts),
      );

    const existingMoveKeys = new Set(
      (existingMoves ?? [])
        .filter((m) => m.source_ts)
        .map((m) => `${m.source_ts}|${m.account}|${m.kind}`),
    );

    const newMoves = moneyMoves.filter(
      (m) => !existingMoveKeys.has(`${m.source_ts}|${m.account}|${m.kind}`),
    );

    if (newMoves.length > 0) {
      const { error } = await supabase.from("money_moves").insert(
        newMoves.map((m) => ({
          user_id: userId,
          kind: m.kind,
          amount: m.amount,
          occurred_at: m.source_ts,
          account: m.account,
          note: m.note,
          source_ts: m.source_ts,
        })),
      );
      if (error) return { error: `Money moves insert failed: ${error.message}` };
      moneyMovesInserted = newMoves.length;
    }
  }

  // 6. Reconciliation: sum of wallet_csv expenses in range vs. parse total
  const { data: reconRows } = await supabase
    .from("expenses")
    .select("amount")
    .eq("user_id", userId)
    .eq("source", "wallet_csv")
    .gte("spent_on", rangeStart)
    .lte("spent_on", rangeEnd);

  const dbExpenseTotal =
    Math.round(
      (reconRows ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100,
    ) / 100;

  const reconciled = Math.abs(dbExpenseTotal - expenseTotal) < 0.01;

  return {
    result: {
      expensesInserted,
      expensesUpdated,
      moneyMovesInserted,
      unknownWalletLabels: unknownLabels,
      dbExpenseTotal,
      parseExpenseTotal: expenseTotal,
      reconciled,
    },
  };
}
