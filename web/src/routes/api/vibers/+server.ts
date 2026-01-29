import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// GET /api/vibers - List connected vibers from hub
export const GET: RequestHandler = async () => {
  try {
    const { vibers } = await hubClient.getVibers();

    // Transform to expected format
    const result = vibers.map((v) => ({
      id: v.id,
      name: v.name,
      platform: v.platform,
      version: v.version,
      capabilities: v.capabilities,
      isConnected: true, // All vibers from hub are connected
      connectedAt: v.connectedAt,
      runningTasks: 0, // TODO: Get from hub
    }));

    return json(result);
  } catch (error) {
    console.error("Failed to fetch vibers:", error);
    return json({ error: "Failed to fetch vibers" }, { status: 500 });
  }
};
