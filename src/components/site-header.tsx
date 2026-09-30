import Link from "next/link";

import { signOut } from "@/app/auth/actions";

/**
 * The two-link nav, shared by the Panel and the list.
 *
 * Shared rather than duplicated because it now appears on both, and two copies
 * of a nav drift the moment a third link arrives. Sign-out lives here too,
 * since it moved off the old home page when / became the Panel.
 */
export function SiteHeader({
  email,
  current,
}: {
  email?: string;
  current: "panel" | "days";
}) {
  const link = (active: boolean) =>
    `text-[13px] underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
      active ? "text-text underline" : "text-text-muted hover:text-text"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <nav className="flex items-baseline gap-4">
          <Link href="/" className={link(current === "panel")}>
            Panel
          </Link>
          <Link href="/days" className={link(current === "days")}>
            Days
          </Link>
        </nav>

        <form action={signOut}>
          <button
            type="submit"
            className="cursor-pointer text-[13px] text-text-muted underline underline-offset-4 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign out
          </button>
        </form>
      </div>

      {email ? (
        <span className="truncate font-mono text-[13px] tracking-[0.02em] text-text-muted">
          {email}
        </span>
      ) : null}
    </div>
  );
}
