"use client";

import { useRef, useState, useTransition } from "react";
import { previewImport, commitImport } from "./actions";
import type { ParsedPreview, CommitResult } from "./actions";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const focusRing =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-signal";

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function dmonRange(start: string, end: string) {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Module-level, not declared inside the preview step's render — a
 * component defined inside a render body is a new function identity every
 * render, which React treats as unmounting and remounting it each time. */
function SummaryRow({ label, count, total }: { label: string; count: number; total?: number }) {
  return (
    <div className="flex justify-between text-[0.9rem]">
      <span className="text-text-muted">{label}</span>
      <span className="tabular-nums text-text">
        {count} rows{total != null ? ` · ${money.format(total)}` : ""}
      </span>
    </div>
  );
}

export function CSVImportClient() {
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handlePreview() {
    setError(null);
    startTransition(async () => {
      let text = "";
      if (tab === "upload") {
        const file = fileRef.current?.files?.[0];
        if (!file) { setError("Choose a CSV file first."); return; }
        try { text = await readFileText(file); }
        catch { setError("Could not read the file."); return; }
      } else {
        text = pasteText.trim();
        if (!text) { setError("Paste some CSV content first."); return; }
      }

      const res = await previewImport(text);
      if (res.error) { setError(res.error); return; }
      setPreview(res.preview!);
      setStep("preview");
    });
  }

  function handleCommit() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const res = await commitImport(preview);
      if (res.error) { setError(res.error); return; }
      setResult(res.result!);
      setStep("done");
    });
  }

  // -------------------------------------------------------------------------
  // Step: input
  // -------------------------------------------------------------------------
  if (step === "input") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-spend-display text-[1.3rem] font-bold text-text">
            Import from Wallet
          </h1>
          <p className="mt-1 text-[0.9rem] text-text-muted">
            Export a CSV from Wallet (any date range), then upload or paste it.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          {(["upload", "paste"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full border-[1.5px] px-4 py-1.5 text-[0.9rem] transition-colors ${focusRing} ${
                tab === t
                  ? "border-text bg-text text-bg"
                  : "border-border text-text hover:border-accent"
              }`}
            >
              {t === "upload" ? "Upload file" : "Paste CSV"}
            </button>
          ))}
        </div>

        {tab === "upload" ? (
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border p-8 text-center hover:border-accent"
            onClick={() => fileRef.current?.click()}
          >
            <span className="text-[2rem]">📂</span>
            <p className="text-[0.9rem] text-text-muted">
              {fileName ?? "Tap to choose a .csv file"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => { setError(null); setFileName(e.target.files?.[0]?.name ?? null); }}
            />
          </div>
        ) : (
          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setError(null); }}
            placeholder={"account;category;currency;amount;…\nPaste the CSV content here"}
            rows={8}
            className={`w-full resize-y rounded-xl border-[1.5px] border-border bg-bg px-3 py-3 font-mono text-[13px] text-text focus:border-accent ${focusRing}`}
          />
        )}

        {error ? <p className="text-[0.88rem] text-over">{error}</p> : null}

        <button
          type="button"
          aria-disabled={isPending}
          className={`w-full rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
          onClick={(e) => { if (isPending) { e.preventDefault(); return; } handlePreview(); }}
        >
          {isPending ? "Parsing…" : "Preview →"}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step: preview
  // -------------------------------------------------------------------------
  if (step === "preview" && preview) {
    const transferCount = preview.moneyMoves.filter((m) => m.kind === "transfer").length;
    const incomeCount = preview.moneyMoves.filter((m) => m.kind === "income").length;
    const investCount = preview.moneyMoves.filter((m) => m.kind === "investment").length;
    const moneyMoveCount = preview.moneyMoves.length;
    const expenseCount = preview.expenses.length;

    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-spend-display text-[1.3rem] font-bold text-text">
            Preview
          </h1>
          <p className="mt-1 text-[0.9rem] text-text-muted">
            {dmonRange(preview.rangeStart, preview.rangeEnd)}
          </p>
        </div>

        {/* Summary */}
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <h2 className="font-spend-display font-bold text-text">Summary</h2>
          <SummaryRow label="Expenses" count={expenseCount} total={preview.expenseTotal} />
          <SummaryRow label="Transfers" count={transferCount} />
          <SummaryRow label="Income" count={incomeCount} total={preview.incomeTotal} />
          <SummaryRow label="Investments" count={investCount} total={preview.investmentTotal} />
        </div>

        {/* Unknown categories */}
        {preview.unknownCategories.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
            <h2 className="font-spend-display font-bold text-text">
              Unknown categories
            </h2>
            <p className="text-[0.88rem] text-text-muted">
              These Wallet labels are not in your category list. They will be
              added to the Others group — you can regroup them in the month plan.
            </p>
            {preview.unknownCategories.map(({ label, count }) => (
              <div key={label} className="flex justify-between text-[0.9rem]">
                <span className="text-text">{label}</span>
                <span className="text-text-muted">{count} row{count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ghost rows */}
        {preview.ghosts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
            <h2 className="font-spend-display font-bold text-text">
              ⚠ {preview.ghosts.length} row{preview.ghosts.length !== 1 ? "s" : ""} in database, not in this CSV
            </h2>
            <p className="text-[0.88rem] text-text-muted">
              These rows were imported before but are missing from the current
              file. They are not deleted — review manually if needed.
            </p>
            {preview.ghosts.slice(0, 5).map((g) => (
              <div key={`${g.source_ts}|${g.account}`} className="tabular-nums text-[0.85rem] text-text-muted">
                {g.source_ts.slice(0, 10)} · {g.account} · {money.format(g.amount)} · {g.category}
              </div>
            ))}
            {preview.ghosts.length > 5 && (
              <p className="text-[0.85rem] text-text-muted">
                …and {preview.ghosts.length - 5} more.
              </p>
            )}
          </div>
        )}

        {/* Manual collisions */}
        {preview.collisions.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
            <h2 className="font-spend-display font-bold text-text">
              {preview.collisions.length} possible manual duplicate{preview.collisions.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-[0.88rem] text-text-muted">
              These manual entries match a CSV row by date and amount. Both will
              be kept — delete the manual one afterward if it is a duplicate.
            </p>
            {preview.collisions.slice(0, 5).map((c, i) => (
              <div key={i} className="text-[0.85rem]">
                <span className="tabular-nums text-text-muted">{c.date} · {money.format(c.amount)}</span>
                {c.manualNote ? <span className="ml-2 text-text">manual: &ldquo;{c.manualNote}&rdquo;</span> : null}
                {c.expense.note ? <span className="ml-2 text-text-muted">csv: &ldquo;{c.expense.note}&rdquo;</span> : null}
              </div>
            ))}
          </div>
        )}

        {error ? <p className="text-[0.88rem] text-over">{error}</p> : null}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setStep("input"); setPreview(null); setError(null); }}
            className={`flex-1 rounded-[10px] border-[1.5px] border-border py-3 text-text ${focusRing}`}
          >
            ← Start over
          </button>
          <button
            type="button"
            onClick={handleCommit}
            aria-disabled={isPending}
            className={`flex-[2] rounded-[10px] bg-accent py-3 font-bold text-accent-ink ${focusRing} aria-disabled:opacity-60`}
          >
            {isPending
              ? "Importing…"
              : `Import ${expenseCount} expenses · ${moneyMoveCount} moves`}
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step: done
  // -------------------------------------------------------------------------
  if (step === "done" && result) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-spend-display text-[1.3rem] font-bold text-text">
            {result.reconciled ? "Import complete ✅" : "Import complete ⚠"}
          </h1>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <div className="flex justify-between text-[0.9rem]">
            <span className="text-text-muted">Expenses inserted</span>
            <span className="tabular-nums text-text">{result.expensesInserted}</span>
          </div>
          <div className="flex justify-between text-[0.9rem]">
            <span className="text-text-muted">Expenses updated (CSV wins)</span>
            <span className="tabular-nums text-text">{result.expensesUpdated}</span>
          </div>
          <div className="flex justify-between text-[0.9rem]">
            <span className="text-text-muted">Money moves inserted</span>
            <span className="tabular-nums text-text">{result.moneyMovesInserted}</span>
          </div>
        </div>

        {/* Reconciliation */}
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
          <h2 className="font-spend-display font-bold text-text">Reconciliation</h2>
          <div className="flex justify-between text-[0.9rem]">
            <span className="text-text-muted">Parsed expense total</span>
            <span className="tabular-nums text-text">{money.format(result.parseExpenseTotal)}</span>
          </div>
          <div className="flex justify-between text-[0.9rem]">
            <span className="text-text-muted">Database total for range</span>
            <span className={`tabular-nums font-bold ${result.reconciled ? "text-signal" : "text-over"}`}>
              {money.format(result.dbExpenseTotal)}
              {result.reconciled ? " ✅" : " ❌"}
            </span>
          </div>
          {!result.reconciled && (
            <p className="text-[0.85rem] text-over">
              Difference: <span className="tabular-nums">{money.format(Math.abs(result.dbExpenseTotal - result.parseExpenseTotal))}</span>.
              This can happen if the range overlaps a previous import with different rows. Check
              for ghost rows or manual entries in the same period.
            </p>
          )}
        </div>

        {result.unknownWalletLabels.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-surface p-4">
            <h2 className="font-spend-display font-bold text-text">Unrecognised Wallet categories</h2>
            <p className="text-[0.88rem] text-text-muted">
              Filed under Other — pick a different chip by hand on /spend if any of these belong
              somewhere more specific.
            </p>
            {result.unknownWalletLabels.map((c) => (
              <p key={c} className="text-[0.9rem] text-text">{c}</p>
            ))}
          </div>
        )}

        <a
          href="/spend"
          className={`block w-full rounded-[10px] bg-accent py-3 text-center font-bold text-accent-ink ${focusRing}`}
        >
          Back to Spend
        </a>
      </div>
    );
  }

  return null;
}
