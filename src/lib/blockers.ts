/**
 * The blocker vocabulary — why a day went wrong.
 *
 * ARCHITECTURE.md calls this the highest-value data in the system: after a few
 * months it says with evidence what actually stops you, and it is the input for
 * the phase 5 layer. That is only true if the codes stay stable, so they live
 * in one place rather than being retyped into the form and the validator.
 *
 * Note the database column is plain `text` with no check constraint, so this
 * list is the only thing enforcing the vocabulary. Adding a code here is all
 * that is needed; removing one would orphan existing rows, so don't.
 */

export const BLOCKER_CODES = [
  "work_ran_late",
  "slept_late",
  "woke_late",
  "unwell",
  "rain",
  "travel",
  "itf_event",
  "social",
  "scrolling",
  "no_energy",
  "gym_crowded",
  "other",
] as const;

export type BlockerCode = (typeof BLOCKER_CODES)[number];

/** Shown in the select. The code is what gets stored. */
export const BLOCKER_LABELS: Record<BlockerCode, string> = {
  work_ran_late: "Work ran late",
  slept_late: "Slept late",
  woke_late: "Woke late",
  unwell: "Unwell",
  rain: "Rain",
  travel: "Travel",
  itf_event: "ITF event",
  social: "Social",
  scrolling: "Scrolling",
  no_energy: "No energy",
  gym_crowded: "Gym crowded",
  other: "Other",
};
