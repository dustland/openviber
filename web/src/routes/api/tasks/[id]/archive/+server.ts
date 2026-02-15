import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { supabaseRequest } from "$lib/server/supabase";
import { writeLog } from "$lib/server/logs";

// POST /api/tasks/[id]/archive - Archive a task
export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Upsert: if the task row exists, set archived_at.
    // If not (legacy tasks created before the tasks table), create a minimal row.
    await supabaseRequest("tasks", {
      method: "POST",
      params: { on_conflict: "id" },
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [{
        id: params.id,
        user_id: locals.user.id,
        archived_at: now,
      }],
    });

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
    await supabaseRequest("tasks", {
      method: "PATCH",
      params: { id: `eq.${params.id}` },
      body: { archived_at: null },
    });

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
