import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { getViberByAuthToken, getViber, updateViberConfig, updateViberName } from "$lib/server/vibers";
import { listEnvironmentConfigForNode } from "$lib/server/environments";
import { getDecryptedOAuthConnections } from "$lib/server/oauth";
import { getSettingsForUser, getPersonalizationForUser } from "$lib/server/settings";
import { gatewayClient } from "$lib/server/gateway";

/**
 * GET /api/vibers/[id]/config
 *
 * Returns the latest config for a viber.
 * Authenticated by either:
 *   - Bearer auth_token (for daemon config pull)
 *   - Cookie-based session (for web UI)
 *
 * For daemon calls (Bearer), the response includes the user's global settings
 * (AI provider keys, personalization, timezone, default model) so the daemon
 * can operate without additional API calls.
 */
export const GET: RequestHandler = async ({ params, request, locals }) => {
  const viberId = params.id;

  // Try Bearer token auth first (daemon calling)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const viber = await getViberByAuthToken(token);
    if (!viber || viber.id !== viberId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const environments = await listEnvironmentConfigForNode(viberId, {
      includeSecrets: true,
    });
    // Include decrypted OAuth tokens so the daemon can use them for skills
    let oauthConnections: Awaited<ReturnType<typeof getDecryptedOAuthConnections>> = [];
    try {
      oauthConnections = await getDecryptedOAuthConnections(viber.user_id);
    } catch {
      // Non-fatal — daemon can still work without OAuth connections
    }

    // Include global user settings so the daemon has API keys, model, timezone, etc.
    let globalSettings: {
      aiProviders: Record<string, { apiKey?: string; baseUrl?: string }>;
      chatModel: string | null;
      timezone: string | null;
      primaryCodingCli: string | null;
      proxyUrl: string | null;
      proxyEnabled: boolean;
    } | null = null;
    try {
      const userSettings = await getSettingsForUser(viber.user_id);

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
        proxyUrl: userSettings.proxyUrl,
        proxyEnabled: userSettings.proxyEnabled,
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
      personalization = await getPersonalizationForUser(viber.user_id);
    } catch {
      // Non-fatal
    }

    return json({
      viberId: viber.id,
      name: viber.name,
      config: viber.config,
      environments,
      oauthConnections,
      globalSettings,
      personalization,
      configVersion: Date.now(),
      status: viber.status,
    });
  }

  // Fall back to cookie-based session auth (web UI)
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const viber = await getViber(locals.user.id, viberId);
  if (!viber) {
    return json({ error: "Viber not found" }, { status: 404 });
  }

  const environments = await listEnvironmentConfigForNode(viberId, {
    includeSecrets: false,
  });

  return json({
    viberId: viber.id,
    name: viber.name,
    config: viber.config,
    environments,
    configVersion: Date.now(),
    status: viber.status,
  });
};

/**
 * PUT /api/vibers/[id]/config
 *
 * Update a viber's name and/or config. Authenticated via session cookie.
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const viberId = params.id;

  // Verify ownership
  const viber = await getViber(locals.user.id, viberId);
  if (!viber) {
    return json({ error: "Viber not found" }, { status: 404 });
  }

  try {
    const body = await request.json();

    // Update name if provided
    if (body.name && typeof body.name === "string") {
      const updated = await updateViberName(viberId, body.name.trim());
      if (!updated) {
        return json({ error: "Failed to update name" }, { status: 500 });
      }
      if (!body.config) {
        return json({ ok: true, name: updated.name });
      }
    }

    // Update config if provided
    if (body.config) {
      const updated = await updateViberConfig(viberId, body.config);
      if (!updated) {
        return json({ error: "Failed to update config" }, { status: 500 });
      }

      // After saving to Supabase, push config to the viber via gateway
      // This ensures the viber pulls and validates the latest config
      if (viber.viber_id) {
        try {
          await gatewayClient.pushConfigToViber(viber.viber_id);
        } catch (error) {
          // Non-fatal: config is saved to Supabase, viber will get it on next pull
          console.warn(`[Config API] Failed to push config to viber ${viber.viber_id}:`, error);
        }
      }

      return json({ ok: true, config: updated.config });
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Failed to update viber:", error);
    return json({ error: "Failed to update" }, { status: 500 });
  }
};
