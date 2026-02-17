import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway";
import {
  listEnvironmentsForUser,
  getEnvironmentForUser,
  setViberEnvironmentForUser,
} from "$lib/server/environments";
import { getSettingsForUser } from "$lib/server/settings";
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
      {
        userId: locals.user.id,
        environmentId: environmentId ?? null,
        title:
          typeof title === "string" && title.trim().length > 0
            ? title.trim()
            : undefined,
        config: {
          skills: extraSkills && extraSkills.length > 0 ? extraSkills : [],
          ...(viberModel ? { model: viberModel } : {}),
        },
      },
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

// GET /api/tasks - List tasks from gateway task persistence
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived = url.searchParams.get("include_archived") === "true";

  try {
    const [{ tasks: persistedTasks }, environments] = await Promise.all([
      gatewayClient.getTasks({
        userId: locals.user.id,
        includeArchived,
      }),
      listEnvironmentsForUser(locals.user.id),
    ]);

    const envNameMap = new Map(environments.map((e) => [e.id, e.name]));

    const result = persistedTasks.map((row) => {
      const environmentId = row.environmentId ?? null;
      return {
        id: row.id,
        viberId: row.viberId ?? null,
        viberName: row.viberName ?? null,
        environmentId,
        environmentName: environmentId ? (envNameMap.get(environmentId) ?? null) : null,
        goal: row.goal ?? row.id,
        status: row.status ?? "unknown",
        createdAt: row.createdAt ?? new Date().toISOString(),
        completedAt: row.completedAt ?? null,
        viberConnected:
          row.isConnected === undefined ? null : row.isConnected !== false,
        archivedAt: row.archivedAt ?? null,
      };
    });

    return json(result);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
};
