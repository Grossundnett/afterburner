/**
 * Per-sport accent colours, Tron: Ares direction (AGENTS.md theme round).
 *
 * The six sports Afterburner ships with get a fixed, hand-picked colour each
 * via `[data-sport="…"]` in globals.css. A sport the owner adds later has no
 * CSS selector waiting for it, so it falls back to this palette, picked
 * deterministically from a hash of its slug — the same sport always lands on
 * the same colour, with no table to maintain. Crimson is excluded on
 * purpose: it's the fitness side's own identity glow (headings, hero
 * numbers, active nav), so no sport may be mistaken for "the app", not just
 * "a sport".
 */
export const SPORT_FALLBACK_PALETTE = [
  "#FF7A45", // orange   — run
  "#2DB1FF", // sky      — cycling
  "#4ECDC4", // teal     — swim
  "#A78BFA", // violet   — gym
  "#8FA3B8", // steel    — body
  "#FF4FA3", // magenta  — discipline
  "#84CC16", // lime
  "#FFC857", // gold
] as const;

/** FNV-1a-ish: cheap, deterministic, no crypto needed for a colour pick. */
export function sportAccent(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return SPORT_FALLBACK_PALETTE[hash % SPORT_FALLBACK_PALETTE.length];
}
