"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { originFromHeaders, safeNextPath } from "@/lib/url";

function loginWithError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

/**
 * Starts the Google OAuth flow.
 *
 * Runs as a Server Action rather than a Client Component so the login page
 * ships no JavaScript and works with scripting disabled. It also keeps the
 * PKCE code verifier server-side: this call writes it as a cookie, and the
 * callback route reads that same cookie to complete the exchange. Server
 * Actions are allowed to write cookies, which is what makes that possible.
 *
 * signInWithOAuth does not redirect by itself — it returns the Google URL for
 * us to send the browser to.
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next")?.toString());
  const origin = originFromHeaders(await headers());

  const callback = new URL("/auth/callback", origin);
  if (next !== "/") {
    callback.searchParams.set("next", next);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });

  if (error) loginWithError(error.message);
  if (!data.url) loginWithError("Google did not return a sign-in URL.");

  redirect(data.url);
}

/**
 * Signs the current user out.
 *
 * Checks for a session first. Per AGENTS.md, a Server Action verifies auth
 * itself — the proxy matcher does not cover Server Actions, because they are
 * POSTs to whatever route they are used on rather than routes of their own.
 *
 * Sign-out is the benign case: signing out someone already signed out harms
 * nobody. It is the cheapest place to establish the habit before step 7, where
 * a Server Action writes rows and the check carries real weight.
 */
export async function signOut() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { error } = await supabase.auth.signOut();
  if (error) loginWithError(error.message);

  redirect("/login");
}
