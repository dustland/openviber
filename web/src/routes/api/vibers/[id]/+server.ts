import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway-client";
import { getSettingsForUser } from "$lib/server/user-settings";
import {
  getViberEnvironmentForUser,
  getViberSkills,
  listSkills,
  setViberEnvironmentForUser,
} from "$lib/server/environments";
import { supabaseRequest } from "$lib/server/supabase-rest";
import { writeLog } from "$lib/server/logs";

// GET /api/vibers/[id] - Get viber details
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [viber, enabledSkills, accountSkillRows, environmentId] = await Promise.all([
      gatewayClient.getViber(params.id),
      getViberSkills(params.id),
      listSkills(locals.user.id),
      getViberEnvironmentForUser(locals.user.id, params.id),
    ]);

    if (!viber) {
      return json({
        id: params.id,
        name: params.id,
        nodeId: null,
        goal: "",
        status: "unknown",
        nodeConnected: null,
        environmentId,
      });
    }

    // Use account-level skills as the full available list
    const skills = accountSkillRows.map((row) => ({
      id: row.skill_id,
      name: row.name,
      description: row.description || "",
    }));

    return json({
      id: viber.id,
      name: viber.goal,
      nodeId: viber.nodeId,
      nodeName: viber.nodeName ?? viber.nodeId,
      goal: viber.goal,
      status: viber.status,
      error: viber.error ?? null,
      nodeConnected: viber.isNodeConnected !== false,
      createdAt: viber.createdAt,
      completedAt: viber.completedAt,
      environmentId,
      skills,
      enabledSkills,
    });
  } catch (error) {
    console.error("Failed to fetch viber:", error);
    return json({ error: "Failed to fetch viber" }, { status: 500 });
  }
};

// PATCH /api/vibers/[id] - Update persisted viber metadata (environment assignment)
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!Object.prototype.hasOwnProperty.call(body, "environmentId")) {
      return json({ error: "environmentId is required" }, { status: 400 });
    }

    const rawEnvironmentId = body.environmentId;
    const normalizedEnvironmentId =
      typeof rawEnvironmentId === "string"
        ? rawEnvironmentId.trim() || null
        : rawEnvironmentId === null
          ? null
          : undefined;

    if (normalizedEnvironmentId === undefined) {
      return json(
        { error: "environmentId must be a string or null" },
        { status: 400 },
      );
    }

    const viber = await gatewayClient.getViber(params.id);
    const assignment = await setViberEnvironmentForUser(
      locals.user.id,
      params.id,
      normalizedEnvironmentId,
      viber?.goal || params.id,
      viber?.nodeId ?? null,
    );

    if (!assignment) {
      return json(
        {
          error:
            "Invalid environment. Make sure it exists and belongs to your account.",
        },
        { status: 400 },
      );
    }

    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Updated viber environment: ${params.id}`,
      viber_id: params.id,
      metadata: {
        environmentId: assignment.environmentId,
      },
    });

    return json({
      ok: true,
      viberId: assignment.viberId,
      environmentId: assignment.environmentId,
    });
  } catch (error) {
    console.error("Failed to update viber:", error);
    return json({ error: "Failed to update viber" }, { status: 500 });
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
    const viber = await gatewayClient.getViber(params.id);
    const nodeId = viber?.nodeId;

    const result = await gatewayClient.createViber(goal, nodeId, messages, undefined, {
      primaryCodingCli: settings.primaryCodingCli ?? undefined,
    });

    if (!result) {
      const errMsg = "Failed to create viber (no response from gateway)";
      writeLog({
        user_id: locals.user.id,
        level: "error",
        category: "activity",
        component: "task",
        message: errMsg,
        viber_id: params.id,
        metadata: { goal: goal.slice(0, 200) },
      });
      return json({ error: errMsg }, { status: 500 });
    }

    return json(result, { status: 201 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to submit to viber:", error);
    writeLog({
      user_id: locals.user.id,
      level: "error",
      category: "activity",
      component: "task",
      message: `Failed to submit to viber: ${errMsg}`,
      viber_id: params.id,
      metadata: { error: errMsg },
    });
    return json({ error: errMsg }, { status: 500 });
  }
};

// DELETE /api/vibers/[id] - Permanently delete a viber
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Try to stop the viber on the gateway first (best-effort)
    try {
      await gatewayClient.stopViber(params.id);
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
