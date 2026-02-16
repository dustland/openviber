import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway";
import {
  listEnvironmentsForUser,
  getEnvironmentForUser,
  setViberEnvironmentForUser,
} from "$lib/server/environments";
import { getSettingsForUser } from "$lib/server/settings";
import { supabaseRequest, toInFilter } from "$lib/server/supabase";
import { writeLog } from "$lib/server/logs";
import { summarizeTaskTitle } from "$lib/server/task-title";

// POST /api/tasks - Create a new task on a node
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { goal, title, viberId, environmentId, channelIds, model, skills } = body;
    console.log("[POST /api/tasks] environmentId from body:", JSON.stringify(environmentId), "| viberId:", viberId);
    const targetViberId = viberId;

    if (!goal) {
      return json({ error: "Missing goal" }, { status: 400 });
    }

    // Look up environment context if provided
    let environment: import("$lib/server/gateway").ViberEnvironmentContext | undefined;
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
    // Use model from request body, or fall back to user's default chatModel setting
    const viberModel = model || settings.chatModel || undefined;

    // Normalize intent-required skills
    const extraSkills = Array.isArray(skills)
      ? skills.filter((s: unknown) => typeof s === "string" && s.length > 0)
      : undefined;

    const result = await gatewayClient.createTask(
      goal,
      targetViberId,
      undefined,
      environment,
      {
        primaryCodingCli: settings.primaryCodingCli ?? undefined,
        ...(selectedChannels && selectedChannels.length > 0
          ? { channelIds: selectedChannels }
          : {}),
        ...(extraSkills && extraSkills.length > 0 ? { skills: extraSkills } : {}),
        proxyUrl: settings.proxyUrl ?? undefined,
        proxyEnabled: settings.proxyEnabled ?? undefined,
      },
      undefined, // oauthTokens
      viberModel,
    );
    if (!result) {
      const errMsg = "No node available or gateway unreachable";
      writeLog({
        user_id: locals.user.id,
        level: "error",
        category: "activity",
        component: "task",
        message: errMsg,
        metadata: { goal: goal.slice(0, 200) },
      });
      return json({ error: errMsg }, { status: 503 });
    }

    // Persist viber to Supabase so it survives gateway restarts; set environment and node
    // Use explicit title if provided (e.g. intent name), otherwise extract
    // the first meaningful line from the goal as the display name.
    const displayName = typeof title === "string" && title.trim()
      ? title.trim()
      : await summarizeTaskTitle(goal, viberModel);

    if (locals.user?.id) {
      // Persist viber environment assignment (existing flow for viber daemon tracking)
      try {
        const assignResult = await setViberEnvironmentForUser(
          locals.user.id,
          result.viberId,
          environmentId ?? null,
          displayName,
          extraSkills,
        );
        console.log("[POST /api/tasks] setViberEnvironmentForUser result:", JSON.stringify(assignResult));
      } catch (e) {
        console.error("Failed to persist viber or assign environment:", e);
      }

      // Persist the task session to the dedicated tasks table
      try {
        await supabaseRequest("tasks", {
          method: "POST",
          prefer: "return=minimal",
          body: {
            id: result.viberId,
            user_id: locals.user.id,
            goal: displayName,
            viber_id: targetViberId ?? null,
            environment_id: environmentId ?? null,
            status: "pending",
            config: {
              skills: extraSkills && extraSkills.length > 0 ? extraSkills : [],
              ...(viberModel ? { model: viberModel } : {}),
            },
          },
        });
      } catch (e) {
        console.error("Failed to persist task:", e);
      }
    }

    // Log viber creation
    writeLog({
      user_id: locals.user.id,
      level: "info",
      category: "activity",
      component: "task",
      message: `Viber created: ${displayName}`,
      viber_id: result.viberId ?? null,
      metadata: { environmentId: environmentId ?? null },
    });

    return json(result, { status: 201 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to create viber:", error);
    writeLog({
      user_id: locals.user.id,
      level: "error",
      category: "activity",
      component: "task",
      message: `Failed to create viber: ${errMsg}`,
      metadata: { error: errMsg },
    });
    return json({ error: errMsg }, { status: 500 });
  }
};

// Persisted task row from Supabase tasks table
interface PersistedTaskRow {
  id: string;              // gateway session ID (text PK)
  goal: string | null;
  viber_id: string | null; // daemon viber ID
  environment_id: string | null;
  status: string | null;
  created_at: string | null;
  archived_at: string | null;
}

// GET /api/tasks - List tasks: Supabase as source of truth, gateway for live state
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived = url.searchParams.get("include_archived") === "true";

  try {
    // DB is the single source of truth for task existence.
    // The gateway only provides live status enrichment (running, connected, etc.).
    const [persistedTasks, { vibers: hubVibers }, environments] = await Promise.all([
      supabaseRequest<PersistedTaskRow[]>("tasks", {
        params: {
          select: "id,goal,viber_id,environment_id,status,created_at,archived_at",
          ...(includeArchived ? {} : { archived_at: "is.null" }),
          order: "created_at.desc",
        },
      }),
      gatewayClient.getTasks(),
      listEnvironmentsForUser(locals.user.id),
    ]);

    const hubMap = new Map(hubVibers.map((v) => [v.id, v]));
    const envNameMap = new Map(environments.map((e) => [e.id, e.name]));

    const result = persistedTasks.map((row) => {
      // Enrich with live gateway state if the task is active there
      const hub = hubMap.get(row.id);
      const environmentId = row.environment_id ?? null;
      return {
        id: row.id,
        viberId: hub?.viberId ?? row.viber_id ?? null,
        viberName: hub?.viberName ?? null,
        environmentId,
        environmentName: environmentId ? (envNameMap.get(environmentId) ?? null) : null,
        goal: row.goal ?? hub?.goal ?? row.id,
        status: hub?.status ?? row.status ?? "unknown",
        createdAt: hub?.createdAt ?? row.created_at ?? new Date().toISOString(),
        completedAt: hub?.completedAt ?? null,
        viberConnected: hub != null ? hub.isConnected !== false : null,
        archivedAt: row.archived_at,
      };
    });

    return json(result);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
};
