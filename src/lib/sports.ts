/**
 * Sports are rows in the `sports` table, one set per user, not a constant here.
 *
 * They used to be a hardcoded list mirroring a check constraint, which meant a
 * migration every time a sport was needed. PHASE2.md item 3 moved them into a
 * table the owner writes to through the app; migration 0002 has the schema and
 * the default set. What is left here is the small amount of logic that is not
 * data: turning a typed label into a slug, and looking a slug back up.
 */

/** The columns any page needs to render a sport. */
export type SportOption = {
  slug: string;
  label: string;
  has_distance: boolean;
};

/**
 * Indexes a user's sports by slug, for the row-by-row lookups a list does.
 *
 * Built once per render and passed down, rather than each row scanning the
 * array.
 */
export function sportMap(
  sports: readonly SportOption[],
): Map<string, SportOption> {
  return new Map(sports.map((sport) => [sport.slug, sport]));
}

/**
 * Display label for a stored slug.
 *
 * Falls back to the slug itself. The composite foreign key means a stored sport
 * always exists in the user's list, so this should not happen — but rendering
 * the raw value beats rendering "undefined" if it ever does.
 */
export function labelFor(map: Map<string, SportOption>, slug: string): string {
  return map.get(slug)?.label ?? slug;
}

/**
 * Whether a stored sport carries a distance, and therefore a pace.
 *
 * Defaults to true for an unknown slug: showing a distance that exists beats
 * hiding one, since the failure mode of guessing wrong is invisible data.
 */
export function hasDistanceFor(
  map: Map<string, SportOption>,
  slug: string,
): boolean {
  return map.get(slug)?.has_distance ?? true;
}

/**
 * Derives a storage slug from a typed label.
 *
 * "Pace walk" becomes pace_walk, matching the seeded defaults so someone who
 * types a name that already exists collides with it rather than creating a
 * near-duplicate. Returns an empty string when nothing usable is left, which
 * the action treats as invalid.
 */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
