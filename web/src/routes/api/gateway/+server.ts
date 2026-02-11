import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway-client";

// GET /api/gateway - Check gateway connection status
export const GET: RequestHandler = async () => {
  try {
    const health = await gatewayClient.checkHealth();

    if (!health) {
      return json({
        connected: false,
        error: "Gateway not reachable",
      });
    }

    return json({
      connected: true,
      status: health.status,
      vibers: health.vibers,
    });
  } catch (error) {
    console.error("Failed to check gateway:", error);
    return json({
      connected: false,
      error: "Failed to check gateway status",
    });
  }
};
