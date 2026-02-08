import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

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
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { messages } = body;

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

    // Look up which node this viber belongs to
    const existingViber = await hubClient.getViber(params.id);
    const nodeId = existingViber?.nodeId;

    // 1. Create viber on the hub (submits to the node)
    const result = await hubClient.createViber(goal, nodeId, simpleMessages);
    if (!result) {
      return json({ error: "Failed to create viber on hub" }, { status: 503 });
    }

    const { viberId } = result;

    // 2. Connect to hub's SSE stream for this viber
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
