import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getNodeByAuthToken, getViberNode, updateNodeConfig, updateNodeName } from "$lib/server/viber-nodes";
import { listEnvironmentConfigForNode } from "$lib/server/environments";

/**
 * GET /api/nodes/[id]/config
 *
 * Returns the latest config for a viber node.
 * Authenticated by either:
 *   - Bearer auth_token (for daemon config pull)
 *   - Cookie-based session (for web UI)
 */
export const GET: RequestHandler = async ({ params, request, locals }) => {
  const nodeId = params.id;

  // Try Bearer token auth first (daemon calling)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const node = await getNodeByAuthToken(token);
    if (!node || node.id !== nodeId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const environments = await listEnvironmentConfigForNode(nodeId, {
      includeSecrets: true,
    });
    return json({
      nodeId: node.id,
      name: node.name,
      config: node.config,
      environments,
      configVersion: Date.now(),
      status: node.status,
    });
  }

  // Fall back to cookie-based session auth (web UI)
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const node = await getViberNode(locals.user.id, nodeId);
  if (!node) {
    return json({ error: "Node not found" }, { status: 404 });
  }

  const environments = await listEnvironmentConfigForNode(nodeId, {
    includeSecrets: false,
  });

  return json({
    nodeId: node.id,
    name: node.name,
    config: node.config,
    environments,
    configVersion: Date.now(),
    status: node.status,
  });
};

/**
 * PUT /api/nodes/[id]/config
 *
 * Update a viber node's name and/or config. Authenticated via session cookie.
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const nodeId = params.id;

  // Verify ownership
  const node = await getViberNode(locals.user.id, nodeId);
  if (!node) {
    return json({ error: "Node not found" }, { status: 404 });
  }

  try {
    const body = await request.json();

    // Update name if provided
    if (body.name && typeof body.name === "string") {
      const updated = await updateNodeName(nodeId, body.name.trim());
      if (!updated) {
        return json({ error: "Failed to update name" }, { status: 500 });
      }
      if (!body.config) {
        return json({ ok: true, name: updated.name });
      }
    }

    // Update config if provided
    if (body.config) {
      const updated = await updateNodeConfig(nodeId, body.config);
      if (!updated) {
        return json({ error: "Failed to update config" }, { status: 500 });
      }
      return json({ ok: true, config: updated.config });
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to update node:", error);
    return json({ error: "Failed to update" }, { status: 500 });
  }
};
