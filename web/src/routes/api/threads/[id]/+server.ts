import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getThreadForUser, updateThreadForUser } from "$lib/server/environments";

// GET /api/threads/[id]
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thread = await getThreadForUser(locals.user.id, params.id);
    if (!thread) {
      return json({ error: "Thread not found" }, { status: 404 });
    }

    return json({ thread });
  } catch (error) {
    console.error("Failed to fetch thread:", error);
    return json({ error: "Failed to fetch thread" }, { status: 500 });
  }
};

// PATCH /api/threads/[id] - update title/status/node assignment
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const thread = await updateThreadForUser(locals.user.id, params.id, {
      title: body?.title,
      status: body?.status,
      activeNodeId:
        body?.activeNodeId !== undefined
          ? String(body.activeNodeId || "").trim() || null
          : undefined,
    });

    if (!thread) {
      return json({ error: "Thread not found" }, { status: 404 });
    }

    return json({ thread });
  } catch (error) {
    console.error("Failed to update thread:", error);
    return json({ error: "Failed to update thread" }, { status: 500 });
  }
};
