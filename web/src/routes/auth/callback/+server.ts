import { redirect, type RequestHandler } from "@sveltejs/kit";
import {
  clearOAuthPkceVerifierCookie,
  clearOAuthStateCookie,
  createSession,
  exchangeSupabaseAuthCode,
  fetchSupabaseProfile,
  readOAuthPkceVerifierCookie,
  readOAuthStateCookie,
  upsertSupabaseUserProfile,
} from "$lib/server/auth";

/**
 * Handles Supabase OAuth callback for providers that use app-managed sessions.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
  const provider = url.searchParams.get("provider")?.trim();
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const next = url.searchParams.get("next") || "/";
  const target = next.startsWith("/") ? next : "/";

  if (provider !== "github") {
    throw redirect(303, "/login?error=unsupported_oauth_provider");
  }

  if (!code || !state) {
    throw redirect(303, "/login?error=missing_callback_params");
  }

  const savedState = readOAuthStateCookie(cookies);
  const verifier = readOAuthPkceVerifierCookie(cookies);
  clearOAuthStateCookie(cookies);
  clearOAuthPkceVerifierCookie(cookies);

  if (!savedState || savedState !== state || !verifier) {
    throw redirect(303, "/login?error=invalid_oauth_state");
  }

  try {
    const session = await exchangeSupabaseAuthCode(code, verifier);
    const profile = await fetchSupabaseProfile(session.accessToken);

    await upsertSupabaseUserProfile(profile);
    await createSession(
      session.accessToken,
      session.refreshToken,
      cookies,
      session.providerToken,
    );

    throw redirect(303, target);
  } catch {
    throw redirect(303, "/login?error=oauth_exchange_failed");
  }
};
