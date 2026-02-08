import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// GET /api/tasks/[taskId] - Legacy: Get viber by ID from hub
export const GET: RequestHandler = async ({ params }) => {
  try {
    const viber = await hubClient.getViber(params.taskId);
    if (!viber) {
      return json({ error: "Viber not found" }, { status: 404 });
    }
    return json(viber);
  } catch (error) {
    console.error("Failed to fetch viber:", error);
    return json({ error: "Failed to fetch viber" }, { status: 500 });
  }
};
