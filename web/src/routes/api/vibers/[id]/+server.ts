import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// GET /api/vibers/[id] - Get viber details
export const GET: RequestHandler = async ({ params }) => {
  try {
    const { vibers } = await hubClient.getVibers();
    const viber = vibers.find((v) => v.id === params.id);

    if (!viber) {
      return json(
        { error: "Viber not found or not connected" },
        { status: 404 },
      );
    }

    return json({
      ...viber,
      isConnected: true,
      runningTasks: [], // TODO: Get running tasks from hub
    });
  } catch (error) {
    console.error("Failed to fetch viber:", error);
    return json({ error: "Failed to fetch viber" }, { status: 500 });
  }
};

// POST /api/vibers/[id] - Submit a task to this viber
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const { goal } = await request.json();

    if (!goal) {
      return json({ error: "Goal is required" }, { status: 400 });
    }

    const result = await hubClient.submitTask(goal, params.id);

    if (!result) {
      return json({ error: "Failed to submit task" }, { status: 500 });
    }

    return json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to submit task:", error);
    return json({ error: "Failed to submit task" }, { status: 500 });
  }
};
