import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { claimViberByToken } from "$lib/server/vibers";

/**
 * POST /api/vibers/onboard
 *
 * Called by the CLI during `openviber onboard --token <token>`.
 * This endpoint does NOT require cookie-based auth — it's authenticated
 * by the one-time onboard token instead.
 *
 * Returns the viber config needed by the daemon.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const token = body.token?.trim();

    if (!token) {
      return json({ error: "Missing onboard token" }, { status: 400 });
    }

    const viber = await claimViberByToken(token);

    if (!viber) {
      return json(
        { error: "Invalid or expired onboard token. Please create a new viber on the web." },
        { status: 401 },
      );
    }

    // Return all config the daemon needs
    return json({
      ok: true,
      viberId: viber.id,
      name: viber.name,
      authToken: viber.auth_token,
      config: viber.config,
    });
  } catch (error) {
    console.error("Onboard token exchange failed:", error);
    return json({ error: "Onboard failed" }, { status: 500 });
  }
};
