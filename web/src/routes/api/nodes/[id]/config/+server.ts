import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { getNodeByAuthToken, getViberNode, updateNodeConfig, updateNodeName } from "$lib/server/viber-nodes";
import { listEnvironmentConfigForNode } from "$lib/server/environments";
import { getDecryptedOAuthConnections } from "$lib/server/oauth";
import { getSettingsForUser, getPersonalizationForUser } from "$lib/server/user-settings";
import { gatewayClient } from "$lib/server/gateway-client";

/**
 * GET /api/nodes/[id]/config
 *
 * Returns the latest config for a viber node.
 * Authenticated by either:
 *   - Bearer auth_token (for daemon config pull)
 *   - Cookie-based session (for web UI)
 *
 * For daemon calls (Bearer), the response includes the user's global settings
 * (AI provider keys, personalization, timezone, default model) so the daemon
 * can operate without additional API calls.
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
    // Include decrypted OAuth tokens so the daemon can use them for skills
    let oauthConnections: Awaited<ReturnType<typeof getDecryptedOAuthConnections>> = [];
    try {
      oauthConnections = await getDecryptedOAuthConnections(node.user_id);
    } catch {
      // Non-fatal — daemon can still work without OAuth connections
    }

    // Include global user settings so the daemon has API keys, model, timezone, etc.
    let globalSettings: {
      aiProviders: Record<string, { apiKey?: string; baseUrl?: string }>;
      chatModel: string | null;
      timezone: string | null;
      primaryCodingCli: string | null;
    } | null = null;
    try {
      const userSettings = await getSettingsForUser(node.user_id);

      // Merge user's own provider keys with the built-in OpenRouter fallback.
      // If the user hasn't added any keys, the daemon can still work via the
      // platform's built-in OpenRouter key.
      const aiProviders = { ...userSettings.aiProviders };
      const hasAnyUserKey = Object.values(aiProviders).some((p) => !!p.apiKey);
      if (!hasAnyUserKey) {
        const platformKey = env.OPENROUTER_API_KEY;
        if (platformKey) {
          aiProviders["openrouter"] = {
            ...(aiProviders["openrouter"] || {}),
            apiKey: platformKey,
            baseUrl: aiProviders["openrouter"]?.baseUrl || undefined,
          };
        }
      }

      globalSettings = {
        aiProviders,
        chatModel: userSettings.chatModel,
        timezone: userSettings.timezone,
        primaryCodingCli: userSettings.primaryCodingCli,
      };
    } catch {
      // Non-fatal
    }

    // Personalization files (injected into agent system prompt)
    let personalization: {
      soulMd: string;
      userMd: string;
      memoryMd: string;
    } | null = null;
    try {
      personalization = await getPersonalizationForUser(node.user_id);
    } catch {
      // Non-fatal
    }

    return json({
      nodeId: node.id,
      name: node.name,
      config: node.config,
      environments,
      oauthConnections,
      globalSettings,
      personalization,
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
      
      // Notify gateway to push config to the node
      try {
        await gatewayClient.pushConfigToNode(nodeId);
      } catch (error) {
        // Non-fatal - config is saved, just couldn't push to node
        console.error("Failed to push config to node:", error);
      }
      
      return json({ ok: true, config: updated.config });
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to update node:", error);
    return json({ error: "Failed to update" }, { status: 500 });
  }
};
