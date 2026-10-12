// Pretty-print overrides for group names. The group key stays as it is in the
// database (renaming keys would be a data migration for a cosmetic change);
// this maps the stored name to how it should read on screen.
const GROUP_DISPLAY: Record<string, string> = {
  "Charity, gifts": "Charity & gifts",
  "Energy, utilities": "Energy & utilities",
};

export const groupDisplay = (name: string): string =>
  GROUP_DISPLAY[name] ?? name;
