"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shows a success message for ~2 s then replaces the URL with `cleanUrl`
 * to remove the status search params, so a refresh doesn't replay the banner.
 *
 * The aria-live region is always present in the DOM (pre-mounted) so screen
 * readers register it before any announcement lands — creating the region and
 * its message in the same frame means most readers announce nothing.
 *
 * Pass message=null on pages where no action just ran; the region is invisible
 * but already registered. Pass cleanUrl so the auto-replace preserves the
 * date param while discarding the status flags.
 */
export function StatusBanner({
  message,
  cleanUrl,
}: {
  message: string | null;
  cleanUrl: string;
}) {
  const [visible, setVisible] = useState(!!message);
  const router = useRouter();

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      router.replace(cleanUrl, { scroll: false });
    }, 2000);
    return () => clearTimeout(t);
  }, [message, cleanUrl, router]);

  if (!visible) {
    // Pre-mounted live region: always in the DOM, always empty when not showing.
    return <span aria-live="polite" className="sr-only" />;
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="border border-border bg-surface-2 p-3 text-[13px] font-medium text-accent"
    >
      {message}
    </p>
  );
}
