import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";
import { listViberEnvironmentAssignmentsForUser } from "$lib/server/environments";

// GET /api/vibers - List connected vibers from hub
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { vibers } = await hubClient.getVibers();
    const assignments = await listViberEnvironmentAssignmentsForUser(
      locals.user.id,
      vibers.map((v) => v.id),
    );
    const assignmentsByViberId = new Map(
      assignments.map((assignment) => [assignment.viberId, assignment.environmentId]),
    );

    // Transform to expected format
    const result = vibers.map((v) => ({
      id: v.id,
      name: v.name,
      platform: v.platform,
      version: v.version,
      capabilities: v.capabilities,
      skills: v.skills,
      isConnected: true,
      connectedAt: v.connectedAt,
      runningTasks: 0,
      environmentId: assignmentsByViberId.get(v.id) ?? null,
    }));

    return json(result);
  } catch (error) {
    console.error("Failed to fetch vibers:", error);
    return json({ error: "Failed to fetch vibers" }, { status: 500 });
  }
};
