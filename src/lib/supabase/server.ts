import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Async because Next.js 16 returns a promise from cookies(). Call it per
 * request and never hoist the result into a module-level constant: the client
 * closes over one request's cookie store, and sharing it across requests would
 * serve one user's session to another.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components are not allowed to write cookies, so this
            // throws when a refresh lands during a render. The proxy refreshes
            // the session on every request and writes the cookies there, so
            // the refreshed token is never actually lost.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user's claims, verified once per request.
 *
 * getClaims() checks the JWT locally against the project's public keys —
 * once asymmetric JWT signing keys are turned on in the Supabase dashboard,
 * that's a local check rather than a round trip to the auth server. Wrapped
 * in React's cache() so, within one request, every Server Component or
 * Server Action that needs the user shares one result instead of each
 * re-running the check. (Cheap even without the cache, but free to not repeat.)
 */
export const getClaims = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getClaims();
});
