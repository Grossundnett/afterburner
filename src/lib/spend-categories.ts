/**
 * The fixed sub-label set per top-level category, from migration 0018.
 * Sub-labels aren't user-extensible (unlike the old per-user
 * spend_categories rows they replaced) — they're a small, deliberately
 * closed list, so they live here rather than in a table. Must match the
 * literal lists in 0018_categories.sql's `expenses_sub_label_check`
 * constraint and get_dashboard's `v_*_sub_labels` arrays exactly.
 */
export const CATEGORY_SUB_LABELS: Record<string, readonly string[]> = {
  Food: ["Groceries", "Eating out", "Snacks & drinks"],
  Transport: ["Public transport", "Auto", "Bike taxi"],
  Shopping: ["Fitness gear", "Football", "Clothes & shoes", "Electronics"],
};

/** Sub-labels whose spend counts as a "paid ride" rather than public
 * transport — mirrors get_dashboard's own `paid_rides` filter. */
export const PAID_RIDE_SUB_LABELS = new Set(["Auto", "Bike taxi"]);
