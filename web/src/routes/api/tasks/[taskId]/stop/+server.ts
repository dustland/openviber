import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// POST /api/tasks/[taskId]/stop - Stop a running task on the viber via the hub
export const POST: RequestHandler = async ({ params }) => {
  try {
    const ok = await hubClient.stopTask(params.taskId);
    if (!ok) {
      return json({ error: "Failed to stop task or task not found" }, { status: 404 });
    }
    return json({ ok: true, taskId: params.taskId });
  } catch (error) {
    console.error("Failed to stop task:", error);
    return json({ error: "Failed to stop task" }, { status: 500 });
  }
};
