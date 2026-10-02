/**
 * The verdict line every Panel card gets per RESEARCH.md §2.1: a status
 * colour plus a plain-language sentence, read under the card's headline
 * number. Colour alone never carries the meaning — the dot sits next to
 * words, per the WCAG note against colour-only signals (§2.3).
 */

export type Status = "good" | "warn" | "bad" | "neutral";

const STATUS_VAR: Record<Status, string> = {
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  neutral: "var(--text-muted)",
};

export function statusColor(status: Status): string {
  return STATUS_VAR[status];
}

export function Verdict({
  status,
  sentence,
}: {
  status: Status;
  sentence: string;
}) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-[13px] text-text-muted">
      <span
        aria-hidden="true"
        className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: statusColor(status) }}
      />
      {sentence}
    </p>
  );
}
