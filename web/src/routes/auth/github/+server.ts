import type { RequestHandler } from "./$types";
import {
  getRequestOrigin,
  getSupabaseGitHubAuthUrl,
  setOAuthPkceVerifierCookie,
  setOAuthStateCookie,
  supabaseAuthConfigured,
} from "$lib/server/auth";

export const GET: RequestHandler = async (event) => {
  const { cookies, url } = event;
  if (!supabaseAuthConfigured()) {
    return new Response("Supabase OAuth is not configured", { status: 503 });
  }

  const next = url.searchParams.get("redirect") || "/";
  const appOrigin = getRequestOrigin(event);
  const { url: authUrl, state, verifier } = getSupabaseGitHubAuthUrl(next, appOrigin);
  const isSecure = url.protocol === "https:";

  setOAuthStateCookie(state, cookies, isSecure);
  setOAuthPkceVerifierCookie(verifier, cookies, isSecure);

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
};
