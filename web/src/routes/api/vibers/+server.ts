import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// POST /api/vibers - Create a new viber on a node
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { goal, nodeId } = body;

    if (!goal) {
      return json({ error: "Missing goal" }, { status: 400 });
    }

    const result = await hubClient.createViber(goal, nodeId);
    if (!result) {
      return json({ error: "No node available or hub unreachable" }, { status: 503 });
    }

    return json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create viber:", error);
    return json({ error: "Failed to create viber" }, { status: 500 });
  }
};

// GET /api/vibers - List vibers from hub
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { vibers } = await hubClient.getVibers();

    // Transform to expected format for the sidebar/frontend
    const result = vibers.map((v) => ({
      id: v.id,
      nodeId: v.nodeId,
      goal: v.goal,
      status: v.status,
      createdAt: v.createdAt,
      completedAt: v.completedAt,
      isConnected: v.isNodeConnected !== false,
    }));

    return json(result);
  } catch (error) {
    console.error("Failed to fetch vibers:", error);
    return json({ error: "Failed to fetch vibers" }, { status: 500 });
  }
};
