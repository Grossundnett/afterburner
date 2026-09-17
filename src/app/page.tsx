import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Home page. For now it exists to prove the auth loop closes: it reads the
 * signed-in identity on the server and shows it.
 *
 * getClaims carries the email in its payload, so no second call is needed to
 * fetch a user. getUser would also work but costs a network round trip to the
 * auth server on every render.
 *
 * The signed-out branch is unreachable in practice because the proxy redirects
 * first, but this has to be correct standing alone — the proxy does not cover
 * everything, so nothing here asserts that data is non-null.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;

  if (!email) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <p className="text-[13px] tracking-[0.02em] text-text-muted">
            Not signed in
          </p>
          <Link
            href="/login"
            className="text-[15px] font-medium text-accent underline underline-offset-4"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[13px] tracking-[0.02em] text-text-muted">
            Signed in as
          </p>
          <p className="mt-2 font-mono text-[20px] leading-snug break-all text-text">
            {email}
          </p>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-md border border-border bg-surface px-4 py-3 text-[15px] font-medium text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
