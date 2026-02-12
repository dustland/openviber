import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { claimNodeByToken } from "$lib/server/viber-nodes";

/**
 * POST /api/vibers/onboard
 *
 * Called by the CLI during `openviber onboard --token <token>`.
 * This endpoint does NOT require cookie-based auth — it's authenticated
 * by the one-time onboard token instead.
 *
 * Returns the node config needed by the daemon.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const token = body.token?.trim();

    if (!token) {
      return json({ error: "Missing onboard token" }, { status: 400 });
    }

    const node = await claimNodeByToken(token);

    if (!node) {
      return json(
        { error: "Invalid or expired onboard token. Please create a new node on the web." },
        { status: 401 },
      );
    }

    // Return all config the daemon needs
    return json({
      ok: true,
      nodeId: node.id,
      name: node.name,
      authToken: node.auth_token,
      config: node.config,
    });
  } catch (error) {
    console.error("Onboard token exchange failed:", error);
    return json({ error: "Onboard failed" }, { status: 500 });
  }
};
