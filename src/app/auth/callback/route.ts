import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { originFromHeaders, safeNextPath } from "@/lib/url";

/**
 * The OAuth callback. Google sends the browser to Supabase, Supabase sends it
 * here with a one-time code, and this exchanges that code for a session.
 *
 * This is where the session cookies are written. It works here and not in a
 * Server Component because Route Handlers are allowed to set cookies — the
 * try/catch in the server client only actually catches in a render.
 *
 * The origin comes from forwarded headers rather than request.url, so the
 * final redirect lands on the public hostname in production.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = originFromHeaders(request.headers);

  const failed = (message: string) =>
    NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`,
    );

  // Google can decline instead of returning a code — a test-user restriction
  // or a cancelled consent screen both arrive this way.
  const oauthError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (oauthError) {
    return failed(oauthError);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return failed("The callback did not include an authorisation code.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return failed(error.message);
  }

  const next = safeNextPath(url.searchParams.get("next"));
  return NextResponse.redirect(`${origin}${next}`);
}
