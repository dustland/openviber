import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// GET /api/tasks - Legacy: List all vibers from hub (optional ?nodeId= to filter)
export const GET: RequestHandler = async ({ url }) => {
  try {
    const { vibers } = await hubClient.getVibers();
    const nodeId = url.searchParams.get("nodeId") || url.searchParams.get("viberId");
    const filtered = nodeId
      ? vibers.filter((v) => v.nodeId === nodeId)
      : vibers;
    return json({ tasks: filtered });
  } catch (error) {
    console.error("Failed to fetch vibers:", error);
    return json({ error: "Failed to fetch vibers" }, { status: 500 });
  }
};
