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
import { writeLog } from "$lib/server/logs";

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
    const { messages, model, skills: requestSkills } = body;

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

    // Use skills from the request (user's current selection) if provided,
    // otherwise fall back to the DB-persisted skills (from intent at creation)
    const activeSkills = Array.isArray(requestSkills) && requestSkills.length > 0
      ? requestSkills.filter((s: unknown) => typeof s === "string" && s)
      : await getViberSkills(params.id);

    const settingsPayload: Record<string, unknown> = {
      primaryCodingCli: settings.primaryCodingCli ?? undefined,
    };
    if (activeSkills.length > 0) {
      settingsPayload.skills = activeSkills;
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
    const userId = locals.user?.id;
    const modelLabel = typeof model === "string" && model ? model : "default";

    if (existingViber) {
      const viberModel = typeof model === "string" && model ? model : undefined;
      try {
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
          const errMsg = "Failed to send message to viber (no response from hub)";
          if (userId) {
            writeLog({
              user_id: userId,
              level: "error",
              category: "activity",
              component: "task",
              message: errMsg,
              viber_id: params.id,
              metadata: { goal: goal.slice(0, 200), model: modelLabel },
            });
          }
          return json({ error: errMsg }, { status: 503 });
        }
        viberId = result.viberId;
      } catch (hubError) {
        const errMsg = hubError instanceof Error ? hubError.message : String(hubError);
        console.error("[Chat] Hub sendMessage failed:", errMsg);
        if (userId) {
          writeLog({
            user_id: userId,
            level: "error",
            category: "activity",
            component: "task",
            message: `Chat failed: ${errMsg}`,
            viber_id: params.id,
            metadata: {
              goal: goal.slice(0, 200),
              model: modelLabel,
              hubError: errMsg,
              phase: "send_message",
            },
          });
        }
        return json({ error: errMsg }, { status: 503 });
      }
    } else {
      const viberModel = typeof model === "string" && model ? model : undefined;
      try {
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
          const errMsg = "Failed to create viber on hub (no response)";
          if (userId) {
            writeLog({
              user_id: userId,
              level: "error",
              category: "activity",
              component: "task",
              message: errMsg,
              viber_id: params.id,
              metadata: { goal: goal.slice(0, 200), model: modelLabel },
            });
          }
          return json({ error: errMsg }, { status: 503 });
        }
        viberId = result.viberId;
      } catch (hubError) {
        const errMsg = hubError instanceof Error ? hubError.message : String(hubError);
        console.error("[Chat] Hub createViber failed:", errMsg);
        if (userId) {
          writeLog({
            user_id: userId,
            level: "error",
            category: "activity",
            component: "task",
            message: `Chat failed: ${errMsg}`,
            viber_id: params.id,
            metadata: {
              goal: goal.slice(0, 200),
              model: modelLabel,
              hubError: errMsg,
              phase: "create_viber",
            },
          });
        }
        return json({ error: errMsg }, { status: 503 });
      }
    }

    // Connect to hub's SSE stream for this viber
    // Small delay to let the daemon start processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const streamUrl = `${HUB_URL}/api/vibers/${viberId}/stream`;
    const streamResponse = await fetch(streamUrl, {
      headers: { Accept: "text/event-stream" },
    });

    if (!streamResponse.ok || !streamResponse.body) {
      const errMsg = `Failed to connect to viber stream (HTTP ${streamResponse.status})`;
      console.error("[Chat] Stream connection failed:", errMsg);
      if (userId) {
        writeLog({
          user_id: userId,
          level: "error",
          category: "activity",
          component: "task",
          message: errMsg,
          viber_id: params.id,
          metadata: {
            goal: goal.slice(0, 200),
            model: modelLabel,
            streamStatus: streamResponse.status,
            phase: "stream_connect",
          },
        });
      }
      return json({ error: errMsg }, { status: 502 });
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
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[Chat] Streaming error:", error);
    if (locals.user?.id) {
      writeLog({
        user_id: locals.user.id,
        level: "error",
        category: "activity",
        component: "task",
        message: `Chat error: ${errMsg}`,
        viber_id: params.id,
        metadata: {
          error: errMsg,
          model: modelLabel,
          stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
          phase: "chat_request",
        },
      });
    }
    return json({ error: errMsg }, { status: 500 });
  }
};
