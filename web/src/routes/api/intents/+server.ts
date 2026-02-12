import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { BUILTIN_INTENTS, type Intent } from "$lib/data/intents";
import { supabaseRequest } from "$lib/server/supabase";

interface IntentRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  icon: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function rowToIntent(row: IntentRow): Intent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: (row.icon || "sparkles") as Intent["icon"],
    body: row.body,
    builtin: false,
  };
}

/**
 * GET /api/intents — returns built-in + user-created intents.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let userIntents: Intent[] = [];
  try {
    const rows = await supabaseRequest<IntentRow[]>("intents", {
      params: {
        select: "*",
        user_id: `eq.${locals.user.id}`,
        order: "created_at.desc",
      },
    });
    userIntents = rows.map(rowToIntent);
  } catch {
    // Table may not exist yet; return built-ins only
  }

  return json({
    intents: [...userIntents, ...BUILTIN_INTENTS],
  });
};

/**
 * POST /api/intents — create a custom intent.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, icon, body: intentBody } = body as {
    name?: string;
    description?: string;
    icon?: string;
    body?: string;
  };

  if (!name?.trim() || !intentBody?.trim()) {
    return json({ error: "Name and body are required" }, { status: 400 });
  }

  try {
    const rows = await supabaseRequest<IntentRow[]>("intents", {
      method: "POST",
      prefer: "return=representation",
      body: {
        user_id: locals.user.id,
        name: name.trim(),
        description: (description || "").trim(),
        icon: icon || "sparkles",
        body: intentBody.trim(),
      },
    });

    return json({ intent: rowToIntent(rows[0]) }, { status: 201 });
  } catch (err) {
    console.error("[Intents API] Failed to create:", err);
    return json({ error: "Failed to create intent" }, { status: 500 });
  }
};

/**
 * PUT /api/intents — update a custom intent (id in body).
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { id, name, description, icon, body: intentBody } = payload as {
    id?: string;
    name?: string;
    description?: string;
    icon?: string;
    body?: string;
  };

  if (!id) {
    return json({ error: "Missing intent id" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description.trim();
  if (icon !== undefined) updates.icon = icon;
  if (intentBody !== undefined) updates.body = intentBody.trim();

  try {
    await supabaseRequest("intents", {
      method: "PATCH",
      params: {
        id: `eq.${id}`,
        user_id: `eq.${locals.user.id}`,
      },
      body: updates,
    });
    return json({ ok: true });
  } catch (err) {
    console.error("[Intents API] Failed to update:", err);
    return json({ error: "Failed to update intent" }, { status: 500 });
  }
};

/**
 * DELETE /api/intents — delete a custom intent (id in body).
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = (await request.json()) as { id?: string };
  if (!id) {
    return json({ error: "Missing intent id" }, { status: 400 });
  }

  try {
    await supabaseRequest("intents", {
      method: "DELETE",
      params: {
        id: `eq.${id}`,
        user_id: `eq.${locals.user.id}`,
      },
    });
    return json({ ok: true });
  } catch (err) {
    console.error("[Intents API] Failed to delete:", err);
    return json({ error: "Failed to delete intent" }, { status: 500 });
  }
};
