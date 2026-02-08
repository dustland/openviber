import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";
import {
  listViberEnvironmentAssignmentsForUser,
  listEnvironmentsForUser,
  getEnvironmentForUser,
  setViberEnvironmentForUser,
} from "$lib/server/environments";
import { supabaseRequest, toInFilter } from "$lib/server/supabase-rest";

// POST /api/vibers - Create a new viber on a node
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { goal, nodeId, environmentId } = body;

    if (!goal) {
      return json({ error: "Missing goal" }, { status: 400 });
    }

    // Look up environment context if provided
    let environment: import("$lib/server/hub-client").ViberEnvironmentContext | undefined;
    if (environmentId && locals.user?.id) {
      try {
        const envDetail = await getEnvironmentForUser(locals.user.id, environmentId, {
          includeSecretValues: true,
        });
        if (envDetail) {
          const vars = envDetail.variables
            ?.filter((v) => v.value && v.value !== "••••••••")
            .map((v) => ({ key: v.key, value: v.value })) || [];

          // Auto-inject user's GitHub token for gh CLI if not already set
          const hasGhToken = vars.some(
            (v) => v.key === "GH_TOKEN" || v.key === "GITHUB_TOKEN",
          );
          if (!hasGhToken && locals.user?.githubToken) {
            vars.push({ key: "GH_TOKEN", value: locals.user.githubToken });
          }

          environment = {
            name: envDetail.name,
            repoUrl: envDetail.repoUrl ?? undefined,
            repoOrg: envDetail.repoOrg ?? undefined,
            repoName: envDetail.repoName ?? undefined,
            repoBranch: envDetail.repoBranch ?? undefined,
            variables: vars,
          };
        }
      } catch (e) {
        console.error("Failed to look up environment:", e);
      }
    }

    const result = await hubClient.createViber(goal, nodeId, undefined, environment);
    if (!result) {
      return json({ error: "No node available or hub unreachable" }, { status: 503 });
    }

    // Assign environment if provided
    if (environmentId && locals.user?.id) {
      try {
        await setViberEnvironmentForUser(locals.user.id, result.viberId, environmentId);
      } catch (e) {
        console.error("Failed to assign environment:", e);
      }
    }

    return json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create viber:", error);
    return json({ error: "Failed to create viber" }, { status: 500 });
  }
};

// GET /api/vibers - List vibers from hub
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived = url.searchParams.get("include_archived") === "true";

  try {
    const { vibers } = await hubClient.getVibers();

    // Look up environment assignments for all vibers
    const viberIds = vibers.map((v) => v.id);
    const [assignments, environments, archivedRows] = await Promise.all([
      listViberEnvironmentAssignmentsForUser(locals.user.id, viberIds),
      listEnvironmentsForUser(locals.user.id),
      viberIds.length > 0
        ? supabaseRequest<Array<{ id: string; archived_at: string | null }>>("vibers", {
          params: {
            select: "id,archived_at",
            id: toInFilter(viberIds),
          },
        })
        : Promise.resolve([]),
    ]);

    const envAssignMap = new Map(
      assignments.map((a) => [a.viberId, a.environmentId]),
    );
    const envNameMap = new Map(
      environments.map((e) => [e.id, e.name]),
    );
    const archivedMap = new Map(
      archivedRows.map((r) => [r.id, r.archived_at]),
    );

    // Transform to expected format for the sidebar/frontend
    const result = vibers
      .map((v) => {
        const environmentId = envAssignMap.get(v.id) ?? null;
        const archivedAt = archivedMap.get(v.id) ?? null;
        return {
          id: v.id,
          nodeId: v.nodeId,
          nodeName: v.nodeName ?? null,
          environmentId,
          environmentName: environmentId ? (envNameMap.get(environmentId) ?? null) : null,
          goal: v.goal,
          status: v.status,
          createdAt: v.createdAt,
          completedAt: v.completedAt,
          isConnected: v.isNodeConnected !== false,
          archivedAt,
        };
      })
      .filter((v) => includeArchived || !v.archivedAt);

    return json(result);
  } catch (error) {
    console.error("Failed to fetch vibers:", error);
    return json({ error: "Failed to fetch vibers" }, { status: 500 });
  }
};
