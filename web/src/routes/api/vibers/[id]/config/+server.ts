import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { getViberByAuthToken, getViber, getViberByAnyId, getFirstViber, createViber, updateViberConfig, updateViberName } from "$lib/server/vibers";
import { listEnvironmentConfigForNode } from "$lib/server/environments";
import { getDecryptedOAuthConnections } from "$lib/server/oauth";
import { getSettingsForUser, getPersonalizationForUser } from "$lib/server/settings";
import { gatewayClient } from "$lib/server/gateway";
import { isE2ETestMode } from "$lib/server/auth";

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

  // In E2E test mode, the synthetic user doesn't own vibers in DB.
  // Look up by viber_id, fall back to first viber row, or return defaults.
  let viber: Awaited<ReturnType<typeof getViber>>;
  if (isE2ETestMode()) {
    viber = await getViberByAnyId(viberId);
    if (!viber) {
      viber = await getFirstViber();
    }
    if (!viber) {
      // No DB rows at all — return empty config so the page loads
      return json({
        viberId,
        name: viberId,
        config: { provider: "openrouter", model: "anthropic/claude-sonnet-4-20250514", tools: ["file", "terminal", "browser"], skills: [] },
        environments: [],
        configVersion: Date.now(),
      });
    }
  } else {
    viber = await getViber(locals.user.id, viberId);
    if (!viber) {
      return json({ error: "Viber not found" }, { status: 404 });
    }
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

  // E2E test mode: synthetic user doesn't own vibers, and FK on user_id
  // prevents creating new rows. Find an existing viber by viber_id, or
  // adopt the first available viber row for config persistence.
  if (isE2ETestMode()) {
    try {
      const body = await request.json();

      // Try to find the viber by its gateway node ID
      let viber = await getViberByAnyId(viberId);

      // If not found, grab the first viber in the DB and adopt it
      if (!viber) {
        viber = await getFirstViber();
      }

      if (!viber) {
        // No viber rows at all — return success with submitted config (ephemeral)
        return json({ ok: true, config: body.config });
      }

      const dbId = viber.id;

      if (body.name && typeof body.name === "string") {
        await updateViberName(dbId, body.name.trim());
        if (!body.config) return json({ ok: true, name: body.name.trim() });
      }
      if (body.config) {
        const updated = await updateViberConfig(dbId, body.config);
        // Push to gateway if possible
        try {
          await gatewayClient.pushConfigToViber(viberId);
        } catch {
          // Non-fatal
        }
        return json({ ok: true, config: updated?.config ?? body.config });
      }
      return json({ ok: true });
    } catch (error) {
      console.error("[E2E] Failed to update viber config:", error);
      return json({ error: "Failed to update" }, { status: 500 });
    }
  }

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
