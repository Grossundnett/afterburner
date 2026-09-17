import { signInWithGoogle } from "@/app/auth/actions";
import { safeNextPath } from "@/lib/url";

/**
 * The login page.
 *
 * A Server Component with a plain form posting to a Server Action, so the page
 * ships no JavaScript at all. The `next` value rides through as a hidden field
 * and is re-sanitised here as well as in the action — it arrives from a query
 * string, so it is untrusted at every hop.
 *
 * searchParams is typed inline rather than with the generated PageProps helper
 * so this file does not depend on route types having been generated yet.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-semibold tracking-tight text-text">
            Afterburner
          </h1>
          <p className="text-[13px] tracking-[0.02em] text-text-muted">
            Sign in to log training.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="border border-border bg-surface-2 p-3 text-[13px] font-medium text-text"
          >
            {error}
          </p>
        ) : null}

        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="w-full cursor-pointer rounded-md border border-border bg-surface px-4 py-3 text-[15px] font-medium text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
