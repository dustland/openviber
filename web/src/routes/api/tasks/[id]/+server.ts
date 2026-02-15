import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway";
import { getSettingsForUser } from "$lib/server/settings";
import {
  getViberEnvironmentForUser,
  getViberSkills,
  listSkills,
  setViberEnvironmentForUser,
} from "$lib/server/environments";
import { supabaseRequest } from "$lib/server/supabase";
import { writeLog } from "$lib/server/logs";

// GET /api/tasks/[id] - Get task details
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [viber, enabledSkills, accountSkillRows, environmentId, gatewayNodes] = await Promise.all([
      gatewayClient.getTask(params.id),
      getViberSkills(params.id),
      listSkills(locals.user.id),
      getViberEnvironmentForUser(locals.user.id, params.id),
      gatewayClient.getVibers(),
    ]);

    if (!viber) {
      return json({
        id: params.id,
        name: params.id,
        viberId: null,
        goal: "",
        status: "unknown",
        viberConnected: null,
        environmentId,
        skills: [],
        enabledSkills: enabledSkills ?? [],
      });
    }

    // Build per-viber skill availability map so chat UI can proactively
    // prompt setup when a selected skill is missing on the current viber.
    const viberSkillMap = new Map<
      string,
      { available: boolean; status: string; healthSummary?: string }
    >();
    const nodeInfo = gatewayNodes.vibers.find((node: any) => node.id === viber.viberId);
    for (const skill of nodeInfo?.skills ?? []) {
      viberSkillMap.set(skill.id, {
        available: skill.available,
        status: skill.status,
        healthSummary: skill.healthSummary,
      });
      viberSkillMap.set(skill.name, {
        available: skill.available,
        status: skill.status,
        healthSummary: skill.healthSummary,
      });
    }

    // Use account-level skills as the list, annotated with node readiness.
    const skills = accountSkillRows.map((row) => {
      const fromNode =
        viberSkillMap.get(row.skill_id) || viberSkillMap.get(row.name);
      return {
        id: row.skill_id,
        name: row.name,
        description: row.description || "",
        available: fromNode?.available,
        status: fromNode?.status,
        healthSummary: fromNode?.healthSummary,
      };
    });

    return json({
      id: viber.id,
      name: viber.goal,
      viberId: viber.viberId,
      viberName: viber.viberName ?? viber.viberId,
      goal: viber.goal,
      status: viber.status,
      error: viber.error ?? null,
      viberConnected: viber.isConnected !== false,
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

// PATCH /api/tasks/[id] - Update persisted task metadata (environment assignment)
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

    // Viber IDs that aren't valid UUIDs (e.g. dev-mode "viber-xxx" format)
    // can't be persisted to Supabase. Accept the change in-memory only.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(params.id)) {
      return json({
        ok: true,
        viberId: params.id,
        environmentId: normalizedEnvironmentId,
      });
    }

    // Gateway lookup is best-effort — env assignment still works if hub is offline
    let viber: Awaited<ReturnType<typeof gatewayClient.getTask>> | null = null;
    try {
      viber = await gatewayClient.getTask(params.id);
    } catch {
      // Hub may be unreachable; proceed with fallback values
    }
    const assignment = await setViberEnvironmentForUser(
      locals.user.id,
      params.id,
      normalizedEnvironmentId,
      viber?.goal || params.id,
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

// POST /api/tasks/[id] - Send a follow-up message to this task's node
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
    const viber = await gatewayClient.getTask(params.id);
    const connectedViberId = viber?.viberId;

    const result = await gatewayClient.createTask(goal, connectedViberId, messages, undefined, {
      primaryCodingCli: settings.primaryCodingCli ?? undefined,
      proxyUrl: settings.proxyUrl ?? undefined,
      proxyEnabled: settings.proxyEnabled ?? undefined,
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

// DELETE /api/tasks/[id] - Permanently delete a task
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Try to stop the viber on the gateway first (best-effort)
    try {
      await gatewayClient.stopTask(params.id);
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
