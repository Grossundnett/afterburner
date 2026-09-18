/**
 * Proves row-level security is actually enforced, rather than merely enabled.
 *
 * Run with: npm run test:rls
 *
 * Reads .env.local itself so the publishable key never has to be pasted into a
 * terminal or a chat. Nothing here prints the key.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * It makes unauthenticated requests — no session cookie, no user — and checks
 * that the database refuses to hand over rows or accept writes.
 *
 *   Reads  exercise the `using` clause of each policy.
 *   Writes exercise the `with check` clause, which is the one generated
 *          policies routinely omit. Without it, an outsider can INSERT rows
 *          carrying someone else's user_id: unreadable afterwards, but written
 *          into their data, and because of the unique constraints it can also
 *          take a date away from them permanently.
 *
 * It does NOT prove that signed-in user A cannot read signed-in user B's rows.
 * That needs two authenticated sessions, so it stays a manual check at step 9:
 * sign in with the first Google account, log a day, sign in with the second,
 * and confirm the first account's day is not visible.
 */

import { readFileSync } from "node:fs";

const TABLES = ["profiles", "days", "activities", "body_metrics"];

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    console.error("Could not read .env.local. Run this from the repo root.");
    process.exit(1);
  }

  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing from .env.local.",
    );
    process.exit(1);
  }

  return { base: url.replace(/\/+$/, ""), key };
}

const { base, key } = loadEnv();
const headers = {
  apikey: key,
  "Content-Type": "application/json",
  "Cache-Control": "no-cache",
};

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
  console.log(`      ${detail}`);
}

// --- Reads: the `using` clause -------------------------------------------

for (const table of TABLES) {
  const response = await fetch(`${base}/rest/v1/${table}?select=*`, {
    headers,
  });
  const body = await response.text();

  if (response.status !== 200) {
    record(
      `anon read of ${table}`,
      false,
      `expected HTTP 200 with an empty array, got ${response.status}: ${body.slice(0, 120)}`,
    );
    continue;
  }

  const empty = body.trim() === "[]";
  record(
    `anon read of ${table}`,
    empty,
    empty
      ? "HTTP 200 and zero rows — the policy hides every row from an anonymous caller"
      : `HTTP 200 but rows came back: ${body.slice(0, 160)}`,
  );
}

// --- Writes: the `with check` clause -------------------------------------

// A user id that is syntactically valid but belongs to nobody. If `with check`
// were missing, this insert would succeed and plant a row under that id.
const FORGED_USER_ID = "00000000-0000-4000-8000-000000000000";

const writeAttempts = [
  {
    table: "days",
    row: { user_id: FORGED_USER_ID, date: "1999-01-01" },
  },
  {
    table: "body_metrics",
    row: { user_id: FORGED_USER_ID, date: "1999-01-01", weight_kg: 1 },
  },
  {
    table: "profiles",
    row: { id: FORGED_USER_ID, display_name: "rls probe" },
  },
];

for (const { table, row } of writeAttempts) {
  const response = await fetch(`${base}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(row),
  });
  const body = await response.text();

  // 401 or 403 is the policy refusing. PostgREST reports code 42501 for an
  // RLS violation. A 2xx here would mean the row was written.
  const refused = response.status === 401 || response.status === 403;

  record(
    `anon insert into ${table} under a forged user id`,
    refused,
    refused
      ? `HTTP ${response.status} — refused by the policy's with-check clause`
      : `HTTP ${response.status} — THE ROW MAY HAVE BEEN WRITTEN: ${body.slice(0, 160)}`,
  );
}

// --- Summary --------------------------------------------------------------

const failed = results.filter((r) => !r.passed);

console.log("");
console.log(`${results.length - failed.length}/${results.length} checks passed`);

if (failed.length > 0) {
  console.log("");
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.name}`);
  console.log("");
  console.log(
    "A failing read means a policy is missing or RLS is off. A failing write\n" +
      "means the policy has no with-check clause, which is the dangerous case:\n" +
      "reads still look correctly isolated while writes leak.",
  );
  process.exit(1);
}

console.log("");
console.log(
  "Row-level security is enforced for anonymous callers.\n" +
    "Cross-user isolation between two signed-in accounts is still a manual\n" +
    "check — see the comment at the top of this file.",
);
