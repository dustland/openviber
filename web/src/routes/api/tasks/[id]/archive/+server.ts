import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway";
import { writeLog } from "$lib/server/logs";

// POST /api/tasks/[id]/archive - Archive a task
export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ok = await gatewayClient.archiveTask(params.id, locals.user.id);
    if (!ok) {
      return json({ error: "Failed to archive task" }, { status: 502 });
    }

    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Task archived: ${params.id}`,
      viber_id: params.id,
    });

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to archive task:", error);
    return json({ error: "Failed to archive task" }, { status: 500 });
  }
};

// DELETE /api/tasks/[id]/archive - Restore (unarchive) a task
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ok = await gatewayClient.restoreTask(params.id);
    if (!ok) {
      return json({ error: "Failed to restore task" }, { status: 502 });
    }

    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Task restored: ${params.id}`,
      viber_id: params.id,
    });

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to restore task:", error);
    return json({ error: "Failed to restore task" }, { status: 500 });
  }
};
