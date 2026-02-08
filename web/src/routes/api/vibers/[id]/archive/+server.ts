import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { supabaseRequest } from "$lib/server/supabase-rest";

// POST /api/vibers/[id]/archive - Archive a viber
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

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to archive viber:", error);
    return json({ error: "Failed to archive viber" }, { status: 500 });
  }
};

// DELETE /api/vibers/[id]/archive - Restore (unarchive) a viber
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

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to restore viber:", error);
    return json({ error: "Failed to restore viber" }, { status: 500 });
  }
};
