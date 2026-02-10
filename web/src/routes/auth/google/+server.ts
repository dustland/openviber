/**
 * GET /auth/google
 *
 * Initiates the Google OAuth flow for Gmail integration.
 * Builds the Google consent URL, sets a CSRF state cookie, and redirects.
 */

import { redirect, type RequestHandler } from "@sveltejs/kit";
import { randomBytes } from "crypto";
import { getGoogleAuthUrl, googleOAuthConfigured } from "$lib/server/oauth";

const GOOGLE_OAUTH_STATE_COOKIE = "openviber_google_oauth_state";

export const GET: RequestHandler = async ({ cookies, locals }) => {
  if (!googleOAuthConfigured()) {
    return new Response("Google OAuth is not configured on this server.", { status: 503 });
  }

  if (!locals.user) {
    throw redirect(303, "/landing?redirect=/settings/integrations");
  }

  // Generate CSRF state
  const state = randomBytes(24).toString("hex");

  cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
  });

  const authUrl = getGoogleAuthUrl(state);
  throw redirect(303, authUrl);
};
