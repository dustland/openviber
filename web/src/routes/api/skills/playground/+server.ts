import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway";

interface PlaygroundRequestBody {
  skillId?: string;
  viberId?: string;
  viberId?: string;
  scenario?: string;
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
    const viber = await gatewayClient.getTask(viberId);
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
    // Accept both viberId (from frontend) and viberId (legacy)
    const viberId = body.viberId?.trim() || body.viberId?.trim();
    const scenario = body.scenario?.trim();

    if (!skillId) {
      return json({ error: "Missing skillId" }, { status: 400 });
    }

    const promptLines = [
      `You have the "${skillId}" skill enabled.`,
      `Your job is to demonstrate this skill by calling one of its tools and showing the result.`,
    ];

    if (scenario) {
      promptLines.push(`\nUser scenario: ${scenario}`);
    } else {
      promptLines.push(
        `\nPick the most representative tool from the "${skillId}" skill and call it with reasonable default arguments.`,
        `Then provide a clear summary of the result.`,
      );
    }

    const prompt = promptLines.join("\n");

    const created = await gatewayClient.createTask(prompt, viberId || undefined);
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
