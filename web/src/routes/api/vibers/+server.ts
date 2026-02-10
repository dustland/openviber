import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";
import {
  listViberEnvironmentAssignmentsForUser,
  listEnvironmentsForUser,
  getEnvironmentForUser,
  setViberEnvironmentForUser,
} from "$lib/server/environments";
import { getSettingsForUser } from "$lib/server/user-settings";
import { supabaseRequest, toInFilter } from "$lib/server/supabase-rest";
import { writeLog } from "$lib/server/logs";

// POST /api/vibers - Create a new viber on a node
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { goal, nodeId, environmentId, channelIds } = body;

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

    const settings = await getSettingsForUser(locals.user.id);
    const selectedChannels = Array.isArray(channelIds)
      ? channelIds.filter((id) => typeof id === "string" && id.length > 0)
      : undefined;
    const result = await hubClient.createViber(goal, nodeId, undefined, environment, {
      primaryCodingCli: settings.primaryCodingCli ?? undefined,
      ...(selectedChannels && selectedChannels.length > 0
        ? { channelIds: selectedChannels }
        : {}),
    });
    if (!result) {
      return json({ error: "No node available or hub unreachable" }, { status: 503 });
    }

    // Persist viber to Supabase so it survives hub restarts; set environment and node
    if (locals.user?.id) {
      try {
        await setViberEnvironmentForUser(
          locals.user.id,
          result.viberId,
          environmentId ?? null,
          goal,
          result.nodeId ?? null,
        );
      } catch (e) {
        console.error("Failed to persist viber or assign environment:", e);
      }
    }

    // Log viber creation
    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Viber created: ${goal}`,
      viber_id: result.viberId,
      node_id: result.nodeId ?? null,
      metadata: { environmentId: environmentId ?? null },
    });

    return json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create viber:", error);
    return json({ error: "Failed to create viber" }, { status: 500 });
  }
};

// Persisted viber row from Supabase (used for listing)
interface PersistedViberRow {
  id: string;
  name: string | null;
  created_at: string | null;
  archived_at: string | null;
  environment_id: string | null;
  node_id: string | null;
}

// GET /api/vibers - List vibers: Supabase as source of truth, hub for live state
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived = url.searchParams.get("include_archived") === "true";

  try {
    const [persistedRows, { vibers: hubVibers }, environments] = await Promise.all([
      supabaseRequest<PersistedViberRow[]>("vibers", {
        params: {
          select: "id,name,created_at,archived_at,environment_id,node_id",
          ...(includeArchived ? {} : { archived_at: "is.null" }),
          order: "created_at.desc",
        },
      }),
      hubClient.getVibers(),
      listEnvironmentsForUser(locals.user.id),
    ]);

    const hubMap = new Map(hubVibers.map((v) => [v.id, v]));
    const envNameMap = new Map(environments.map((e) => [e.id, e.name]));

    const result = persistedRows
      .filter((row) => includeArchived || !row.archived_at)
      .map((row) => {
        const hub = hubMap.get(row.id);
        const environmentId = row.environment_id ?? null;
        return {
          id: row.id,
          nodeId: hub?.nodeId ?? row.node_id ?? null,
          nodeName: hub?.nodeName ?? null,
          environmentId,
          environmentName: environmentId ? (envNameMap.get(environmentId) ?? null) : null,
          goal: hub?.goal ?? row.name ?? row.id,
          status: hub?.status ?? "unknown",
          createdAt: hub?.createdAt ?? row.created_at ?? new Date().toISOString(),
          completedAt: hub?.completedAt ?? null,
          nodeConnected:
            hub != null ? (hub.isNodeConnected !== false) : null,
          archivedAt: row.archived_at,
        };
      });

    return json(result);
  } catch (error) {
    console.error("Failed to fetch vibers:", error);
    return json({ error: "Failed to fetch vibers" }, { status: 500 });
  }
};
