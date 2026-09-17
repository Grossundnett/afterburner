/**
 * URL safety helpers shared by the sign-in action and the OAuth callback.
 *
 * Both need identical rules. Duplicating them in two files is how one copy
 * quietly loses a guard.
 */

/**
 * The public origin of this app, derived from request headers.
 *
 * Vercel terminates TLS at its edge and forwards to the function over an
 * internal hostname, so `new URL(request.url).origin` can be that internal
 * host rather than the address the user typed. Redirecting to it after login
 * sends people somewhere that does not exist publicly — a failure that cannot
 * reproduce on localhost, because locally there is no proxy in front.
 *
 * `x-forwarded-host` and `x-forwarded-proto` are what the edge sets to record
 * the original request, so they win when present.
 */
export function originFromHeaders(headers: Headers): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  const forwardedProto = headers.get("x-forwarded-proto");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");

  const proto = forwardedProto ?? (isLocal ? "http" : "https");

  return `${proto}://${host}`;
}

/**
 * Sanitises a `next` redirect target down to a same-site path.
 *
 * Anything that is not a plain path becomes "/". Three cases matter:
 *
 * - `https://evil.example` — absolute, obviously rejected.
 * - `//evil.example` — protocol-relative. Browsers treat this as an absolute
 *   URL, so it is an open redirect, yet it passes a naive `startsWith("/")`
 *   check. Supabase's own documented snippet only checks for a leading slash
 *   and would forward you here.
 * - `/\evil.example` — some browsers normalise the backslash to a slash and
 *   treat it the same way.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}
