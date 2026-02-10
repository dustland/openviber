import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";
import { getSettingsForUser } from "$lib/server/user-settings";
import { supabaseRequest } from "$lib/server/supabase-rest";
import { writeLog } from "$lib/server/logs";

// GET /api/vibers/[id] - Get viber details
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [viber, { nodes }] = await Promise.all([
      hubClient.getViber(params.id),
      hubClient.getNodes(),
    ]);

    if (!viber) {
      return json({
        id: params.id,
        nodeId: null,
        goal: "",
        status: "unknown",
        nodeConnected: null,
      });
    }

    // Resolve skills from the node hosting this viber
    const node = nodes.find((n) => n.nodeId === viber.nodeId);
    const skills = (node?.skills ?? []).map((s) => ({
      id: s.id || s.name,
      name: s.name,
      description: s.description,
    }));

    return json({
      id: viber.id,
      nodeId: viber.nodeId,
      nodeName: viber.nodeName ?? viber.nodeId,
      goal: viber.goal,
      status: viber.status,
      error: viber.error ?? null,
      nodeConnected: viber.isNodeConnected !== false,
      createdAt: viber.createdAt,
      completedAt: viber.completedAt,
      skills,
    });
  } catch (error) {
    console.error("Failed to fetch viber:", error);
    return json({ error: "Failed to fetch viber" }, { status: 500 });
  }
};

// POST /api/vibers/[id] - Send a follow-up message to this viber's node
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { goal, messages } = body;

    if (!goal) {
      return json({ error: "Goal is required" }, { status: 400 });
    }

    const settings = await getSettingsForUser(locals.user.id);
    const viber = await hubClient.getViber(params.id);
    const nodeId = viber?.nodeId;

    const result = await hubClient.createViber(goal, nodeId, messages, undefined, {
      primaryCodingCli: settings.primaryCodingCli ?? undefined,
    });

    if (!result) {
      return json({ error: "Failed to create viber" }, { status: 500 });
    }

    return json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to submit to viber:", error);
    return json({ error: "Failed to submit to viber" }, { status: 500 });
  }
};

// DELETE /api/vibers/[id] - Permanently delete a viber
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Try to stop the viber on the hub first (best-effort)
    try {
      await hubClient.stopViber(params.id);
    } catch {
      // Ignore — viber may already be stopped or hub unreachable
    }

    // Delete from Supabase
    await supabaseRequest("vibers", {
      method: "DELETE",
      params: { id: `eq.${params.id}` },
    });

    // Log deletion event
    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Viber permanently deleted: ${params.id}`,
      viber_id: params.id,
    });

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to delete viber:", error);
    return json({ error: "Failed to delete viber" }, { status: 500 });
  }
};
