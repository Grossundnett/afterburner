import type { MetadataRoute } from "next";

/**
 * The stated minimum to pass Chrome's installability check — enough to add
 * Afterburner to a home screen, nothing more. No real app icon exists yet
 * (only SVGs and a favicon.ico in public/); referencing favicon.ico here as
 * an "any"-sized icon is a known placeholder, not a design decision — flagged
 * in SPRINT_NOTES.md item 9 rather than fabricated as if it were finished.
 *
 * background_color/theme_color are hex literals, not var(--bg)/var(--accent)
 * — the Web App Manifest spec is static JSON/CSS-colour-syntax read by the
 * OS before any page (and its stylesheet) ever loads, so a CSS custom
 * property can't resolve here. Values copied from globals.css's [data-spend]
 * dark block (the quick-add route's own theme), not invented.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Afterburner",
    short_name: "Afterburner",
    description: "Personal multi-sport training tracker",
    start_url: "/spend/quick-add",
    display: "standalone",
    background_color: "#121A17",
    theme_color: "#121A17",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
