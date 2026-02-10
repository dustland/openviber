/**
 * /api/integrations
 *
 * GET  — List the user's OAuth connections (no tokens, just summaries).
 * DELETE — Disconnect an OAuth provider.
 */

import { json, type RequestHandler } from "@sveltejs/kit";
import {
  listOAuthConnections,
  deleteOAuthConnection,
  googleOAuthConfigured,
} from "$lib/server/oauth";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await listOAuthConnections(locals.user.id);

  // Build available providers list (whether connected or not)
  const providers = [
    {
      id: "google",
      name: "Google",
      description: "Gmail, Calendar, Drive, and other Google services",
      configured: googleOAuthConfigured(),
      connection: connections.find((c) => c.provider === "google") || null,
    },
  ];

  return json({ providers });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const provider = body?.provider;

  if (!provider || typeof provider !== "string") {
    return json({ error: "Missing provider" }, { status: 400 });
  }

  const deleted = await deleteOAuthConnection(locals.user.id, provider);
  if (!deleted) {
    return json({ error: "Connection not found" }, { status: 404 });
  }

  return json({ ok: true });
};
