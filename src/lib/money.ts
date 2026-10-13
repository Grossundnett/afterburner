/**
 * Parses a rupee amount typed with Indian comma grouping (1,00,505) or
 * Western grouping (100,505) — both use the comma as a thousands
 * separator, so stripping commas before Number() handles either. Without
 * this, Number("1,00,505") is NaN, which every `|| 0` fallback then
 * silently turns into a zero that looks like a successful, empty save
 * rather than a rejected one.
 */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
