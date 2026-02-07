import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createEnvironmentForUser,
  extractVariablesFromBody,
  listEnvironmentsForUser,
} from "$lib/server/environments";

// GET /api/environments - list environments for the current user
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const viberId = url.searchParams.get("viberId") || undefined;
    const environments = await listEnvironmentsForUser(locals.user.id, viberId);
    return json({ environments });
  } catch (error) {
    console.error("Failed to list environments:", error);
    return json({ error: "Failed to list environments" }, { status: 500 });
  }
};

// POST /api/environments - create environment
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    if (!name) {
      return json({ error: "Environment name is required." }, { status: 400 });
    }

    const environment = await createEnvironmentForUser(locals.user.id, {
      name,
      description: body?.description,
      type: body?.type,
      repoUrl: body?.repoUrl,
      repoOrg: body?.repoOrg,
      repoName: body?.repoName,
      repoBranch: body?.repoBranch,
      containerImage: body?.containerImage,
      workingDir: body?.workingDir,
      setupScript: body?.setupScript,
      networkAccess:
        typeof body?.networkAccess === "boolean" ? body.networkAccess : true,
      persistVolume:
        typeof body?.persistVolume === "boolean" ? body.persistVolume : true,
      metadata: body?.metadata,
      variables: extractVariablesFromBody(body),
    });

    return json({ environment }, { status: 201 });
  } catch (error) {
    console.error("Failed to create environment:", error);
    return json({ error: "Failed to create environment" }, { status: 500 });
  }
};

