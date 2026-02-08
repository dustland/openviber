import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// POST /api/tasks/[taskId]/stop - Legacy: Stop a viber via the hub
export const POST: RequestHandler = async ({ params }) => {
  try {
    const ok = await hubClient.stopViber(params.taskId);
    if (!ok) {
      return json({ error: "Failed to stop viber or viber not found" }, { status: 404 });
    }
    return json({ ok: true, viberId: params.taskId });
  } catch (error) {
    console.error("Failed to stop viber:", error);
    return json({ error: "Failed to stop viber" }, { status: 500 });
  }
};
