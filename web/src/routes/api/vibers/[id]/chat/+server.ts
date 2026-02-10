import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";
import type { ViberEnvironmentContext } from "$lib/server/hub-client";
import {
  getViberEnvironmentForUser,
  getEnvironmentForUser,
  getViberSkills,
} from "$lib/server/environments";
import { getSettingsForUser } from "$lib/server/user-settings";
import { getDecryptedOAuthConnections } from "$lib/server/oauth";

const HUB_URL = process.env.VIBER_HUB_URL || "http://localhost:6007";

/**
 * POST /api/vibers/[id]/chat
 *
 * AI SDK streaming endpoint for @ai-sdk/svelte Chat class.
 * 1. Looks up the viber to find its parent node
 * 2. Creates a new viber on that node with the full chat history
 * 3. Connects to the hub's SSE stream endpoint for that viber
 * 4. Pipes the AI SDK data stream back to the frontend
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  try {
    const body = await request.json();
    const { messages, model } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "Missing messages" }, { status: 400 });
    }

    // Extract the last user message as the goal
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user");
    const goal =
      lastUserMessage?.content ||
      lastUserMessage?.parts?.find((p: any) => p.type === "text")?.text ||
      "";

    if (!goal) {
      return json({ error: "No user message found" }, { status: 400 });
    }

    // Convert AI SDK UIMessage format to simple message format for the hub
    const simpleMessages = messages
      .map((m: any) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : m.parts
              ?.filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("\n") || "",
      }))
      .filter((m: any) => m.content);

    // Look up environment context for this viber
    let environment: ViberEnvironmentContext | undefined;
    if (locals.user?.id) {
      try {
        const envId = await getViberEnvironmentForUser(locals.user.id, params.id);
        if (envId) {
          const envDetail = await getEnvironmentForUser(locals.user.id, envId, {
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
        }
      } catch (e) {
        console.error("[Chat] Failed to look up environment:", e);
      }
    }

    const settings =
      locals.user?.id != null
        ? await getSettingsForUser(locals.user.id)
        : { primaryCodingCli: null as string | null };

    // Fetch extra skills attached to this viber (from intent at creation)
    const viberSkills = await getViberSkills(params.id);

    const settingsPayload: Record<string, unknown> = {
      primaryCodingCli: settings.primaryCodingCli ?? undefined,
    };
    if (viberSkills.length > 0) {
      settingsPayload.skills = viberSkills;
    }

    // Look up OAuth tokens for this user (for skills like Gmail)
    let oauthTokens: Record<string, { accessToken: string; refreshToken?: string | null }> | undefined;
    if (locals.user?.id) {
      try {
        const connections = await getDecryptedOAuthConnections(locals.user.id);
        if (connections.length > 0) {
          oauthTokens = {};
          for (const conn of connections) {
            oauthTokens[conn.provider] = {
              accessToken: conn.accessToken,
              refreshToken: conn.refreshToken,
            };
          }
        }
      } catch (e) {
        console.error("[Chat] Failed to look up OAuth tokens:", e);
      }
    }

    const existingViber = await hubClient.getViber(params.id);
    let viberId: string;

    if (existingViber) {
      const viberModel = typeof model === "string" && model ? model : undefined;
      const result = await hubClient.sendMessage(
        params.id,
        simpleMessages,
        goal,
        environment,
        settingsPayload,
        oauthTokens,
        viberModel,
      );
      if (!result) {
        return json({ error: "Failed to send message to viber" }, { status: 503 });
      }
      viberId = result.viberId;
    } else {
      const viberModel = typeof model === "string" && model ? model : undefined;
      const result = await hubClient.createViber(
        goal,
        undefined,
        simpleMessages,
        environment,
        settingsPayload,
        oauthTokens,
        viberModel,
      );
      if (!result) {
        return json({ error: "Failed to create viber on hub" }, { status: 503 });
      }
      viberId = result.viberId;
    }

    // Connect to hub's SSE stream for this viber
    // Small delay to let the daemon start processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const streamUrl = `${HUB_URL}/api/vibers/${viberId}/stream`;
    const streamResponse = await fetch(streamUrl, {
      headers: { Accept: "text/event-stream" },
    });

    if (!streamResponse.ok || !streamResponse.body) {
      return json({ error: "Failed to connect to stream" }, { status: 502 });
    }

    // 3. Pipe the hub SSE stream to the frontend
    // The hub already sets the correct SSE format (AI SDK data stream protocol)
    return new Response(streamResponse.body as any, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  } catch (error) {
    console.error("[Chat] Streaming error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
