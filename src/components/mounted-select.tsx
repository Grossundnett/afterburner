"use client";

import { useEffect, useState } from "react";

/**
 * A <select> that's visibly dimmed and disabled until the client has
 * hydrated, matching the same convention the spend quick-add keypad uses
 * (STATUS_latest.md, recurring bug classes). A native select doesn't
 * strictly need JS to be usable — but without this, there's no visible cue
 * that the page is still catching up, and a tap during that window is
 * indistinguishable from a tap that silently did nothing.
 */
export function MountedSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [mounted, setMounted] = useState(false);
  // The one legitimate case this lint rule can't tell apart from the
  // "mirroring a prop" anti-pattern it exists to catch: there is no
  // render-time way to know the client has hydrated, by definition —
  // that's what this effect firing once *is*.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const { className, ...rest } = props;
  return (
    <select
      {...rest}
      disabled={!mounted}
      className={`${className ?? ""} transition-opacity ${mounted ? "" : "opacity-50"}`}
    />
  );
}
