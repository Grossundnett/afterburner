import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Client Components.
 *
 * Safe to call on every render: createBrowserClient memoises the underlying
 * client per set of arguments, so repeated calls return the same instance
 * rather than opening a new connection each time.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
