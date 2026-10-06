"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/app/auth/actions";

type NavProps = { email?: string };

const NAV_LINKS = [
  { href: "/", label: "Panel", Icon: GridIcon },
  { href: "/days", label: "Days", Icon: CalendarIcon },
  { href: "/spend", label: "Spend", Icon: CardIcon },
] as const;

export function AppNav({ email }: NavProps) {
  const pathname = usePathname();

  function active(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────── */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[160px] flex-col border-r border-border bg-surface"
        aria-label="Main navigation"
      >
        <div className="px-4 py-5">
          <span className="text-[12px] font-semibold tracking-[0.12em] uppercase text-accent">
            Afterburner
          </span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {NAV_LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-2.5 rounded-md py-2 pl-4 pr-3 text-[14px] transition-colors ${
                active(href)
                  ? "text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {active(href) && (
                <span
                  className="absolute left-0 top-[6px] bottom-[6px] w-[2px] rounded-full bg-accent"
                  aria-hidden="true"
                />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Log today is separated from the destination links because it is an
            action, not a place. The border-t makes the distinction visible
            without needing a different component type. */}
        <div className="mx-2 mt-4 border-t border-border pt-4">
          <Link
            href="/log"
            className="flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[14px] font-medium bg-accent text-bg transition-opacity hover:opacity-90 active:opacity-80"
          >
            <PlusIcon className="h-4 w-4 shrink-0" />
            Log today
          </Link>
        </div>

        <div className="mt-auto px-4 pb-5 pt-4">
          {email && (
            <p className="mb-2 truncate font-mono text-[11px] text-text-muted">
              {email}
            </p>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="cursor-pointer text-[12px] text-text-muted underline underline-offset-4 transition-colors hover:text-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile bottom bar ──────────────────────────────────────── */}
      <nav
        className="flex md:hidden fixed bottom-0 inset-x-0 z-40 h-[60px] items-stretch border-t border-border bg-surface"
        aria-label="Main navigation"
      >
        {NAV_LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-[3px] text-[11px] transition-colors ${
              active(href) ? "text-text" : "text-text-muted"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${active(href) ? "text-accent" : ""}`}
            />
            {label}
          </Link>
        ))}

        {/* Log today: accent colour distinguishes it from the three destination
            tabs — it is the primary action on mobile, not a place to navigate
            to. */}
        <Link
          href="/log"
          className="flex flex-1 flex-col items-center justify-center gap-[3px] text-[11px] font-medium text-accent"
        >
          <PlusIcon className="h-5 w-5" />
          Log today
        </Link>
      </nav>
    </>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
// No external library: each icon ships as a tiny inline <svg> so the nav stays
// a server-import-friendly module without a bundler plugin or icon font.

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="13" height="11.5" rx="1.5" />
      <line x1="1.5" y1="6.5" x2="14.5" y2="6.5" />
      <line x1="5" y1="1.5" x2="5" y2="4.5" />
      <line x1="11" y1="1.5" x2="11" y2="4.5" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="1" y="3.5" width="14" height="9" rx="1.5" />
      <line x1="1" y1="7" x2="15" y2="7" />
      <rect
        x="3" y="9.5" width="4" height="1.5" rx="0.5"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" />
      <line x1="8" y1="5" x2="8" y2="11" />
      <line x1="5" y1="8" x2="11" y2="8" />
    </svg>
  );
}
