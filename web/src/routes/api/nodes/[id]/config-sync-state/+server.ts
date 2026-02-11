/**
 * PUT /api/nodes/[id]/config-sync-state
 *
 * Update a node's config sync state (called by gateway on config:ack).
 * Authenticated via gateway API token or service role.
 */

import { json, type RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { updateConfigSyncState } from "$lib/server/viber-nodes";

export const PUT: RequestHandler = async ({ params, request }) => {
  const nodeId = params.id;

  // Authenticate via gateway API token or service role
  const authHeader = request.headers.get("authorization");
  const gatewayToken = env.VIBER_GATEWAY_API_TOKEN || env.VIBER_BOARD_API_TOKEN || env.VIBER_HUB_API_TOKEN;
  
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== gatewayToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const syncState = body.config_sync_state || body;

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
