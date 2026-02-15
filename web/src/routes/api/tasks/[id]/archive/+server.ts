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
    // Find the viber row by viber_id (gateway text ID) and set archived_at
    await supabaseRequest("vibers", {
      method: "PATCH",
      params: { viber_id: `eq.${params.id}` },
      prefer: "return=minimal",
      body: {
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
      params: { viber_id: `eq.${params.id}` },
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
