"use client";

import { useEffect } from "react";

/** Registers the network-only service worker — the one piece of PWA setup
 * that can't happen from a Server Component. Safe to mount everywhere:
 * sw.js never caches anything, so running it outside /spend/quick-add has
 * no effect beyond making the whole app technically installable too. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a nice-to-have, not a feature anything else
        // depends on — a failed registration (unsupported browser, blocked
        // by an extension) should never surface as an error to the user.
      });
    }
  }, []);

  return null;
}
