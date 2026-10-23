/**
 * This hour's category chips, ranked by how often that category gets used
 * at this hour historically, ties broken by overall frequency, then filled
 * out in sort order if history is thin. Built from the most recent 500
 * spends — recent habit beats a lifetime average for "what am I about to
 * log right now", and it keeps the query light regardless of account age.
 *
 * Shared by `/spend` and `/spend/quick-add` so both pages pick chips the
 * same way — one ranking, one save path, per SPEND_RESEARCH.md.
 */
export function rankCategories(
  rows: { category: string; created_at: string }[],
  catMeta: Map<string, { label: string; emoji: string; sort: number; group: string | null }>,
  currentHour: number,
): string[] {
  const atHour = new Map<string, number>();
  const overall = new Map<string, number>();
  for (const r of rows) {
    overall.set(r.category, (overall.get(r.category) ?? 0) + 1);
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(
        new Date(r.created_at),
      ),
    );
    if (hour === currentHour) {
      atHour.set(r.category, (atHour.get(r.category) ?? 0) + 1);
    }
  }

  const ranked = [...catMeta.keys()].sort((a, b) => {
    const atDiff = (atHour.get(b) ?? 0) - (atHour.get(a) ?? 0);
    if (atDiff !== 0) return atDiff;
    const overallDiff = (overall.get(b) ?? 0) - (overall.get(a) ?? 0);
    if (overallDiff !== 0) return overallDiff;
    return (catMeta.get(a)?.sort ?? 0) - (catMeta.get(b)?.sort ?? 0);
  });

  return ranked.slice(0, 6);
}
