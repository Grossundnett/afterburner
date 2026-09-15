import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Server Components cannot write cookies, so without this the access token
 * would expire mid-session and never be renewed. This runs before any route
 * renders, refreshes the token if it is close to expiry, and writes the new
 * cookies onto the outgoing response.
 *
 * Named `proxy` rather than `middleware`: Next.js 16 deprecated the middleware
 * file convention and renamed it to proxy.
 *
 * No route protection here — redirecting unauthenticated users to /login
 * arrives with the login page itself in step 5.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
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

          // Cache-Control, Expires and Pragma, supplied by the library. Without
          // these a CDN could cache a response carrying auth cookies and serve
          // one person's session token to somebody else.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Called for its side effect: this is what triggers the refresh and the
  // setAll write above. getClaims verifies the JWT signature against the
  // project's public keys rather than trusting the cookie, and unlike getUser
  // it does so locally, with no round trip to the auth server on each request.
  //
  // Nothing may run between createServerClient and this call. Code in between
  // can leave the client holding a stale token and log users out at random.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, which never need a session refresh.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
