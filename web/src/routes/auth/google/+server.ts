import type { RequestHandler } from "./$types";
import {
  getSupabaseGoogleAuthUrl,
  setOAuthStateCookie,
  supabaseAuthConfigured,
} from "$lib/server/auth";

export const GET: RequestHandler = async ({ cookies, url }) => {
  if (!supabaseAuthConfigured()) {
    return new Response("Supabase OAuth is not configured", { status: 503 });
  }

  const next = url.searchParams.get("redirect") || "/vibers";
  const { url: authUrl, state } = getSupabaseGoogleAuthUrl(next);
  setOAuthStateCookie(state, cookies, url.protocol === "https:");

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
};
