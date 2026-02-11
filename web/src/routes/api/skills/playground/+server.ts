import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway-client";

interface PlaygroundRequestBody {
  skillId?: string;
  nodeId?: string;
}

interface PollResult {
  ok: boolean;
  status: "completed" | "error" | "stopped" | "timeout";
  viberId: string;
  result?: unknown;
  partialText?: string;
  error?: string;
  message?: string;
}

const TERMINAL_STATUSES = new Set(["completed", "error", "stopped"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollViberResult(viberId: string): Promise<PollResult> {
  const timeoutMs = 90_000;
  const pollIntervalMs = 1500;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const viber = await gatewayClient.getViber(viberId);
    if (viber && TERMINAL_STATUSES.has(viber.status)) {
      if (viber.status === "completed") {
        return {
          ok: true,
          status: "completed",
          viberId,
          result: viber.result,
          partialText: viber.partialText,
          message: "Playground run completed successfully.",
        };
      }

      const terminalStatus = viber.status === "error" || viber.status === "stopped"
        ? viber.status
        : "error";

      return {
        ok: false,
        status: terminalStatus,
        viberId,
        result: viber.result,
        partialText: viber.partialText,
        error: viber.error,
        message: viber.error || `Playground run finished with status: ${viber.status}.`,
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    ok: false,
    status: "timeout",
    viberId,
    message: "Playground run timed out. Check viber logs for live progress.",
  };
}

/**
 * POST /api/skills/playground
 * Run a skill verification prompt on a target node and wait for completion.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as PlaygroundRequestBody;
    const skillId = body.skillId?.trim();
    const nodeId = body.nodeId?.trim();

    if (!skillId) {
      return json({ error: "Missing skillId" }, { status: 400 });
    }

    const prompt = [
      `Playground verification for skill: ${skillId}`,
      "Run the skill's built-in playground verification workflow (for example, call skill_playground_verify when available).",
      "Then summarize whether it worked, what checks were performed, and any setup issues found.",
    ].join("\n\n");

    const created = await gatewayClient.createViber(prompt, nodeId || undefined);
    if (!created?.viberId) {
      return json({ error: "No node available or gateway unreachable" }, { status: 503 });
    }

    const pollResult = await pollViberResult(created.viberId);
    return json(pollResult, {
      status: pollResult.ok ? 200 : pollResult.status === "timeout" ? 202 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run playground";
    console.error("[Skills Playground API]", error);
    return json({ error: message }, { status: 500 });
  }
};
