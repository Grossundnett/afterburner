import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
