/**
 * POST /api/nodes/[id]/config-sync-state
 *
 * Update a node's config sync state (called by gateway on config:ack).
 * Authenticated via VIBER_GATEWAY_API_TOKEN.
 */

import { json, type RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { updateConfigSyncState } from "$lib/server/viber-nodes";

export const POST: RequestHandler = async ({ params, request }) => {
  const nodeId = params.id;

  // Authenticate via gateway API token
  const authHeader = request.headers.get("authorization");
  const expectedToken = env.VIBER_GATEWAY_API_TOKEN || env.VIBER_BOARD_API_TOKEN || env.VIBER_HUB_API_TOKEN;
  
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== expectedToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const syncState = body.syncState || body; // Accept both formats

    const updated = await updateConfigSyncState(nodeId, syncState);
    if (!updated) {
      return json({ error: "Node not found" }, { status: 404 });
    }

    return json({ ok: true, config_sync_state: updated.config_sync_state });
  } catch (error) {
    console.error("Failed to update config sync state:", error);
    return json({ error: "Failed to update" }, { status: 500 });
  }
};
