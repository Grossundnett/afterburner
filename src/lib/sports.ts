/**
 * The sport vocabulary.
 *
 * Unlike blocker codes, this one IS enforced by the database — `activities.sport`
 * carries `check (sport in ('run','ride','swim','gym','yoga','other'))`. So this
 * list has to match the migration exactly. Adding a sport means a migration as
 * well as an edit here; an unlisted value is rejected by Postgres, not silently
 * stored.
 *
 * The order is the order they appear in the select, which is roughly how often
 * they are likely to be used rather than alphabetical.
 */

export const SPORTS = ["run", "ride", "swim", "gym", "yoga", "other"] as const;

export type Sport = (typeof SPORTS)[number];

export const SPORT_LABELS: Record<Sport, string> = {
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  gym: "Gym",
  yoga: "Yoga",
  other: "Other",
};

/**
 * Display label for a sport value read back from the database.
 *
 * The column is `text`, so a row arrives typed as a plain string even though the
 * check constraint narrows it. This does the lookup without casting, and falls
 * back to the raw value rather than rendering "undefined" if a row ever holds
 * something this list does not know about.
 */
export function sportLabel(value: string): string {
  return (SPORTS as readonly string[]).includes(value)
    ? SPORT_LABELS[value as Sport]
    : value;
}
