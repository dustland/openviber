import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient } from "$lib/server/gateway-client";

interface ProvisionRequestBody {
  skillId?: string;
  nodeId?: string;
  install?: boolean;
  authAction?: "none" | "copy" | "start";
}

const SUPPORTED_SKILLS = new Set([
  "cursor-agent",
  "codex-cli",
  "gemini-cli",
  "github",
  "railway",
  "tmux",
]);

/**
 * POST /api/skills/provision
 *
 * Starts a proactive setup chat flow for a missing skill on a target node.
 * The resulting viber is a guided installer conversation (choice-based).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ProvisionRequestBody;
    const skillId = body.skillId?.trim();
    const nodeId = body.nodeId?.trim();

    if (!skillId) {
      return json({ error: "Missing skillId" }, { status: 400 });
    }
    if (!nodeId) {
      return json({ error: "Missing nodeId" }, { status: 400 });
    }
    if (!SUPPORTED_SKILLS.has(skillId)) {
      return json(
        {
          error: `Skill provisioning is currently supported for: ${Array.from(SUPPORTED_SKILLS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const nodes = await gatewayClient.getNodes();
    const targetNode = nodes.nodes.find((node) => node.id === nodeId);
    if (!targetNode) {
      return json(
        { error: "Target node is not connected. Bring the node online and retry." },
        { status: 404 },
      );
    }

    const provisionResult = await gatewayClient.provisionNodeSkill(nodeId, {
      skillId,
      install: body.install !== false,
      authAction:
        body.authAction === "none" ||
        body.authAction === "copy" ||
        body.authAction === "start"
          ? body.authAction
          : "copy",
    });

    return json({
      ok: provisionResult.ok,
      ready: provisionResult.ready,
      skillId,
      nodeId,
      before: provisionResult.before ?? null,
      after: provisionResult.after ?? null,
      auth: provisionResult.auth ?? { required: false, ready: true },
      installLog: provisionResult.installLog ?? [],
      error: provisionResult.error ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start skill setup flow";
    console.error("[Skills Provision API]", error);
    return json({ error: message }, { status: 500 });
  }
};

