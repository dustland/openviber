import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  deleteEnvironmentForUser,
  extractVariablesFromBody,
  getEnvironmentForUser,
  updateEnvironmentForUser,
} from "$lib/server/environments";

// GET /api/environments/[id]
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const environment = await getEnvironmentForUser(locals.user.id, params.id);
    if (!environment) {
      return json({ error: "Environment not found" }, { status: 404 });
    }
    return json({ environment });
  } catch (error) {
    console.error("Failed to fetch environment:", error);
    return json({ error: "Failed to fetch environment" }, { status: 500 });
  }
};

// PUT /api/environments/[id]
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const hasVariablePayload =
      Array.isArray(body?.variables) ||
      Boolean(body?.environmentVariables) ||
      Boolean(body?.secrets);

    const environment = await updateEnvironmentForUser(locals.user.id, params.id, {
      name: body?.name,
      description: body?.description,
      type: body?.type,
      repoUrl: body?.repoUrl,
      repoOrg: body?.repoOrg,
      repoName: body?.repoName,
      repoBranch: body?.repoBranch,
      containerImage: body?.containerImage,
      workingDir: body?.workingDir,
      setupScript: body?.setupScript,
      networkAccess: body?.networkAccess,
      persistVolume: body?.persistVolume,
      metadata: body?.metadata,
      variables: hasVariablePayload ? extractVariablesFromBody(body) : undefined,
      replaceVariables: hasVariablePayload ? body?.replaceVariables ?? true : false,
    });

    if (!environment) {
      return json({ error: "Environment not found" }, { status: 404 });
    }

    return json({ environment });
  } catch (error) {
    console.error("Failed to update environment:", error);
    return json({ error: "Failed to update environment" }, { status: 500 });
  }
};

// DELETE /api/environments/[id]
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await deleteEnvironmentForUser(locals.user.id, params.id);
    if (!deleted) {
      return json({ error: "Environment not found" }, { status: 404 });
    }
    return json({ ok: true });
  } catch (error) {
    console.error("Failed to delete environment:", error);
    return json({ error: "Failed to delete environment" }, { status: 500 });
  }
};
