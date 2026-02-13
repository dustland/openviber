/**
 * GET /auth/google/callback
 *
 * Handles the OAuth callback from Google. Validates the CSRF state,
 * exchanges the code for tokens, stores them encrypted, and redirects.
 */

import { redirect, type RequestHandler } from "@sveltejs/kit";
import {
  exchangeGoogleCode,
  fetchGoogleUserEmail,
  upsertOAuthConnection,
  GOOGLE_OAUTH_SCOPES,
} from "$lib/server/oauth";

const GOOGLE_OAUTH_STATE_COOKIE = "openviber_google_oauth_state";

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  // Must be authenticated
  if (!locals.user) {
    throw redirect(303, "/landing?redirect=/settings/integrations");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("[Google OAuth] Error from Google:", error);
    throw redirect(303, "/settings/integrations?error=google_denied");
  }

  if (!code || !state) {
    throw redirect(303, "/settings/integrations?error=missing_params");
  }

  // Validate CSRF state
  const savedState = cookies.get(GOOGLE_OAUTH_STATE_COOKIE);
  cookies.delete(GOOGLE_OAUTH_STATE_COOKIE, { path: "/" });

  if (!savedState || savedState !== state) {
    throw redirect(303, "/settings/integrations?error=invalid_state");
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeGoogleCode(code);

    // Fetch the user's email
    const accountEmail = await fetchGoogleUserEmail(tokens.access_token);

    // Store the connection
    await upsertOAuthConnection(locals.user.id, "google", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scopes: GOOGLE_OAUTH_SCOPES,
      accountEmail,
    });

    throw redirect(303, "/settings/integrations?success=google_connected");
  } catch (err: any) {
    // Re-throw redirects
    if (err?.status === 303) throw err;

    console.error("[Google OAuth] Callback error:", err);
    throw redirect(303, "/settings/integrations?error=token_exchange_failed");
  }
};
