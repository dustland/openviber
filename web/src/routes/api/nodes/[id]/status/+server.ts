import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

/**
 * GET /api/nodes/:id/status - Get detailed observability status for a node.
 * Proxies to the hub's /api/nodes/:id/status endpoint.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const nodeId = params.id;
  if (!nodeId) {
    return json({ error: "Missing node id" }, { status: 400 });
  }

  try {
    const result = await hubClient.getNodeStatus(nodeId);

    if (!result) {
      return json(
        { error: "Node not found or hub unreachable" },
        { status: 404 },
      );
    }

    return json(result);
  } catch (error) {
    console.error("Failed to get node status:", error);
    return json({ error: "Failed to get node status" }, { status: 500 });
  }
};
