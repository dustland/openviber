import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// GET /api/hub - Check hub connection status
export const GET: RequestHandler = async () => {
  try {
    const health = await hubClient.checkHealth();

    if (!health) {
      return json({
        connected: false,
        error: "Hub not reachable",
      });
    }

    return json({
      connected: true,
      status: health.status,
      vibers: health.vibers,
    });
  } catch (error) {
    console.error("Failed to check hub:", error);
    return json({
      connected: false,
      error: "Failed to check hub status",
    });
  }
};
