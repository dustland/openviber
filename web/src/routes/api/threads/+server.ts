import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createThreadForUser,
  listThreadsForUser,
  type ThreadStatus,
} from "$lib/server/environments";

// GET /api/threads?environmentId=&viberId=&status=&nodeId=
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const environmentId = url.searchParams.get("environmentId") || undefined;
    const viberId = url.searchParams.get("viberId") || undefined;
    const nodeId = url.searchParams.get("nodeId") || undefined;
    const status = (url.searchParams.get("status") || undefined) as
      | ThreadStatus
      | undefined;

    const threads = await listThreadsForUser(locals.user.id, {
      environmentId,
      viberId,
      nodeId,
      status,
    });

    return json({ threads });
  } catch (error) {
    console.error("Failed to list threads:", error);
    return json({ error: "Failed to list threads" }, { status: 500 });
  }
};

// POST /api/threads - create new thread
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const environmentId =
      typeof body?.environmentId === "string"
        ? (String(body.environmentId || "").trim() || undefined)
        : undefined;
    const viberId = String(body?.viberId || "").trim();

    if (!viberId) {
      return json(
        { error: "viberId is required." },
        { status: 400 },
      );
    }

    const thread = await createThreadForUser(locals.user.id, {
      environmentId,
      viberId,
      activeNodeId:
        body?.activeNodeId !== undefined
          ? String(body.activeNodeId || "").trim() || null
          : undefined,
      title: body?.title,
    });

    if (!thread) {
      return json(
        { error: "Environment not found or not assigned to this viber." },
        { status: 404 },
      );
    }

    return json({ thread }, { status: 201 });
  } catch (error) {
    console.error("Failed to create thread:", error);
    return json({ error: "Failed to create thread" }, { status: 500 });
  }
};
