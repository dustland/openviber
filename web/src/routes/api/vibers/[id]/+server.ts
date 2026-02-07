import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";
import {
  getViberEnvironmentForUser,
  setViberEnvironmentForUser,
} from "$lib/server/environments";

// GET /api/vibers/[id] - Get viber details
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { vibers } = await hubClient.getVibers();
    const viber = vibers.find((v) => v.id === params.id);
    const environmentId = await getViberEnvironmentForUser(locals.user.id, params.id);

    if (!viber) {
      return json({
        id: params.id,
        name: params.id,
        platform: null,
        version: null,
        capabilities: null,
        skills: [],
        isConnected: false,
        runningTasks: [],
        environmentId,
      });
    }

    return json({
      ...viber,
      isConnected: true,
      runningTasks: [], // TODO: Get running tasks from hub
      environmentId,
    });
  } catch (error) {
    console.error("Failed to fetch viber:", error);
    return json({ error: "Failed to fetch viber" }, { status: 500 });
  }
};

// PATCH /api/vibers/[id] - Set or clear environment assignment for this viber
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const environmentId =
      body?.environmentId === null
        ? null
        : typeof body?.environmentId === "string"
          ? (body.environmentId.trim() || null)
          : undefined;

    if (environmentId === undefined) {
      return json({ error: "environmentId must be a string or null." }, { status: 400 });
    }

    const assignment = await setViberEnvironmentForUser(
      locals.user.id,
      params.id,
      environmentId,
    );

    if (!assignment) {
      return json({ error: "Environment not found." }, { status: 404 });
    }

    return json(assignment);
  } catch (error) {
    console.error("Failed to update viber environment:", error);
    return json({ error: "Failed to update viber environment" }, { status: 500 });
  }
};

// POST /api/vibers/[id] - Submit a task to this viber (optionally with full chat history for context)
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { goal, messages } = body;

    if (!goal) {
      return json({ error: "Goal is required" }, { status: 400 });
    }

    const result = await hubClient.submitTask(goal, params.id, messages);

    if (!result) {
      return json({ error: "Failed to submit task" }, { status: 500 });
    }

    return json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to submit task:", error);
    return json({ error: "Failed to submit task" }, { status: 500 });
  }
};
