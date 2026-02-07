import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createViberNode, listViberNodes, deleteViberNode } from "$lib/server/viber-nodes";

// GET /api/nodes - List user's viber nodes
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nodes = await listViberNodes(locals.user.id);
    return json({ nodes });
  } catch (error) {
    console.error("Failed to list viber nodes:", error);
    return json({ error: "Failed to list nodes" }, { status: 500 });
  }
};

// POST /api/nodes - Create a new viber node
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = body.name?.trim() || "My Viber";
    const node = await createViberNode(locals.user.id, name);
    return json({ node }, { status: 201 });
  } catch (error) {
    console.error("Failed to create viber node:", error);
    return json({ error: "Failed to create node" }, { status: 500 });
  }
};

// DELETE /api/nodes - Delete a viber node (by id in body)
export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const nodeId = body.id;
    if (!nodeId) {
      return json({ error: "Missing node id" }, { status: 400 });
    }
    const ok = await deleteViberNode(locals.user.id, nodeId);
    if (!ok) {
      return json({ error: "Node not found" }, { status: 404 });
    }
    return json({ ok: true });
  } catch (error) {
    console.error("Failed to delete viber node:", error);
    return json({ error: "Failed to delete node" }, { status: 500 });
  }
};
