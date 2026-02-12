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
    // Upsert: create the row if it doesn't exist, then set archived_at
    await supabaseRequest("vibers", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        id: params.id,
        name: params.id,
        archived_at: new Date().toISOString(),
      },
    });

    // Log archive event
    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Viber archived: ${params.id}`,
      viber_id: params.id,
    });

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to archive viber:", error);
    return json({ error: "Failed to archive viber" }, { status: 500 });
  }
};

// DELETE /api/tasks/[id]/archive - Restore (unarchive) a task
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await supabaseRequest("vibers", {
      method: "PATCH",
      params: { id: `eq.${params.id}` },
      body: { archived_at: null },
    });

    // Log restore event
    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Viber restored: ${params.id}`,
      viber_id: params.id,
    });

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to restore viber:", error);
    return json({ error: "Failed to restore viber" }, { status: 500 });
  }
};
