import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";

/**
 * Paths an unauthenticated visitor may reach.
 *
 * `/login` must be here or it would redirect to itself forever. `/auth` must
 * be here because the OAuth callback has to be reachable while signed out —
 * that is the whole point of it. Matching is exact or segment-prefixed, so
 * a route like `/authorize` would not slip through.
 */
const PUBLIC_PATHS = ["/login", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every matched request, and redirects
 * unauthenticated visitors to /login.
 *
 * Server Components cannot write cookies, so without this the access token
 * would expire mid-session and never be renewed.
 *
 * Named `proxy` rather than `middleware`: Next.js 16 deprecated the middleware
 * file convention and renamed it to proxy.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Cache directives the library supplies when it writes auth cookies. Held
  // here so they can be reapplied if this ends up returning a redirect.
  let authHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Write onto the request so anything reading cookies later in this
          // same pass sees the refreshed values.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          // Rebuild the response so it carries the updated request.
          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          // Cache-Control, Expires and Pragma. Without these a CDN could cache
          // a response carrying auth cookies and serve one person's session
          // token to somebody else.
          authHeaders = { ...authHeaders, ...headers };
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // This does double duty: it triggers the refresh and the setAll write above,
  // and it tells us whether anybody is signed in. getClaims verifies the JWT
  // signature against the project's public keys locally, with no round trip to
  // the auth server on each request.
  //
  // Nothing may run between createServerClient and this call. Code in between
  // can leave the client holding a stale token and log users out at random.
  //
  // getClaims returns a three-way union: claims with no error when signed in;
  // null data with an error when something broke; and null data with NO error
  // when there is simply no session. That third case is why the test below is
  // `data?.claims` rather than `!error` — testing the error would read "nobody
  // is logged in" as success and wave every request through.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);

    // Remember where they were headed so login can return them there. No
    // point recording the home page, which is where login lands by default.
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }

    const redirectResponse = NextResponse.redirect(loginUrl);

    // A refresh may have just written new cookies onto `response`. Returning a
    // bare redirect would throw them away, which surfaces as a random logout
    // rather than a reproducible bug, so carry them across with their cache
    // directives.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    for (const [key, value] of Object.entries(authHeaders)) {
      redirectResponse.headers.set(key, value);
    }

    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, which never need a session refresh.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
