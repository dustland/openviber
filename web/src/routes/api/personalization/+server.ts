import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { supabaseRequest } from "$lib/server/supabase";

interface PersonalizationRow {
  soul_md: string;
  user_md: string;
  memory_md: string;
}

/**
 * GET /api/personalization
 * Returns the three personalization markdown files for the current user.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await supabaseRequest<PersonalizationRow[]>("user_settings", {
      params: {
        select: "soul_md,user_md,memory_md",
        user_id: `eq.${locals.user.id}`,
      },
    });

    const row = Array.isArray(rows) ? rows[0] : null;

    return json({
      soul: row?.soul_md ?? "",
      user: row?.user_md ?? "",
      memory: row?.memory_md ?? "",
    });
  } catch (err) {
    console.error("[Personalization API] Failed to load:", err);
    return json({ soul: "", user: "", memory: "" });
  }
};

/**
 * PUT /api/personalization
 * Update one or more personalization files.
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { soul, user, memory } = body as {
    soul?: string;
    user?: string;
    memory?: string;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (soul !== undefined) updates.soul_md = soul;
  if (user !== undefined) updates.user_md = user;
  if (memory !== undefined) updates.memory_md = memory;

  try {
    const userId = locals.user.id;

    // Check if row exists
    const existing = await supabaseRequest<{ id: string }[]>("user_settings", {
      params: { select: "id", user_id: `eq.${userId}` },
    });

    if (Array.isArray(existing) && existing.length > 0) {
      await supabaseRequest("user_settings", {
        method: "PATCH",
        params: { user_id: `eq.${userId}` },
        body: updates,
      });
    } else {
      // Insert new row with defaults
      await supabaseRequest("user_settings", {
        method: "POST",
        prefer: "return=minimal",
        body: {
          user_id: userId,
          soul_md: soul ?? "",
          user_md: user ?? "",
          memory_md: memory ?? "",
        },
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[Personalization API] Failed to save:", err);
    return json({ error: "Failed to save personalization" }, { status: 500 });
  }
};
