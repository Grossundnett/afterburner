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
  const router = useRouter();

  // "Adjust state during render" (React's own pattern for resetting state
  // when a prop changes) rather than mirroring `message` into state inside
  // an effect — a plain synchronous setState at the top of an effect body
  // causes an avoidable extra render on every message change.
  const [prevMessage, setPrevMessage] = useState(message);
  const [hidden, setHidden] = useState(false);
  if (message !== prevMessage) {
    setPrevMessage(message);
    setHidden(false);
  }
  const visible = !!message && !hidden;

  // The timer itself is a genuine effect — reacting to time passing, not
  // mirroring a prop — so it stays here. Its setState call is inside the
  // timeout callback, not synchronously in the effect body.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => {
      setHidden(true);
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
