import type { RequestHandler } from "./$types";
import {
  getSupabaseGitHubAuthUrl,
  setOAuthPkceVerifierCookie,
  setOAuthStateCookie,
  supabaseAuthConfigured,
} from "$lib/server/auth";

export const GET: RequestHandler = async ({ cookies, url }) => {
  if (!supabaseAuthConfigured()) {
    return new Response("Supabase OAuth is not configured", { status: 503 });
  }

  const next = url.searchParams.get("redirect") || "/";
  const { url: authUrl, state, verifier } = getSupabaseGitHubAuthUrl(next);
  const isSecure = url.protocol === "https:";

  setOAuthStateCookie(state, cookies, isSecure);
  setOAuthPkceVerifierCookie(verifier, cookies, isSecure);

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
};
