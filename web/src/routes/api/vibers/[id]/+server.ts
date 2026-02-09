import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";
import { getSettingsForUser } from "$lib/server/user-settings";

// GET /api/vibers/[id] - Get viber details
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const viber = await hubClient.getViber(params.id);

    if (!viber) {
      return json({
        id: params.id,
        nodeId: null,
        goal: "",
        status: "unknown",
        nodeConnected: null,
      });
    }

    return json({
      id: viber.id,
      nodeId: viber.nodeId,
      nodeName: viber.nodeName ?? viber.nodeId,
      goal: viber.goal,
      status: viber.status,
      nodeConnected: viber.isNodeConnected !== false,
      createdAt: viber.createdAt,
      completedAt: viber.completedAt,
    });
  } catch (error) {
    console.error("Failed to fetch viber:", error);
    return json({ error: "Failed to fetch viber" }, { status: 500 });
  }
};

// POST /api/vibers/[id] - Send a follow-up message to this viber's node
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { goal, messages } = body;

    if (!goal) {
      return json({ error: "Goal is required" }, { status: 400 });
    }

    const settings = await getSettingsForUser(locals.user.id);
    const viber = await hubClient.getViber(params.id);
    const nodeId = viber?.nodeId;

    const result = await hubClient.createViber(goal, nodeId, messages, undefined, {
      primaryCodingCli: settings.primaryCodingCli ?? undefined,
    });

    if (!result) {
      return json({ error: "Failed to create viber" }, { status: 500 });
    }

    return json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to submit to viber:", error);
    return json({ error: "Failed to submit to viber" }, { status: 500 });
  }
};
