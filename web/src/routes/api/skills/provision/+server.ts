import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gatewayClient, type SkillHealthResult } from "$lib/server/gateway-client";

interface ProvisionRequestBody {
  skillId?: string;
  nodeId?: string;
}

const SUPPORTED_SKILLS = new Set(["cursor-agent"]);

function buildCursorAgentSetupPrompt(missingChecks: string[]): string {
  const missingText =
    missingChecks.length > 0
      ? missingChecks.map((check) => `- ${check}`).join("\n")
      : "- Cursor CLI install\n- tmux install\n- Cursor auth";

  return [
    "You are running proactive setup for the `cursor-agent` skill on this node.",
    "",
    "Current missing items:",
    missingText,
    "",
    "Follow this exact interaction model:",
    "1) Re-check prerequisites in terminal first:",
    "   - agent --version (or cursor-agent --version)",
    "   - tmux -V",
    "   - agent auth status",
    "2) If something is missing, ASK the user first with explicit options:",
    "   - \"Should I install this for you now? [Yes / No]\"",
    "3) If user says Yes, install immediately using terminal commands:",
    "   - Cursor CLI: curl https://cursor.com/install -fsS | bash",
    "   - tmux (macOS): brew install tmux",
    "   - tmux (Debian/Ubuntu): sudo apt-get update && sudo apt-get install -y tmux",
    "4) If auth is missing, ASK:",
    "   - \"Should I open login now? [Open browser / Copy command / Skip]\"",
    "   - If Open browser: run `agent login` and wait.",
    "   - If Copy command: print a copy-ready command and wait for confirmation.",
    "5) After setup actions, re-run checks and report READY/NOT READY.",
    "",
    "Be concise and keep the user in control with explicit choices.",
  ].join("\n");
}

function getSkillHealthForNode(
  skillHealth: SkillHealthResult[] | undefined,
  skillId: string,
): SkillHealthResult | null {
  if (!skillHealth || skillHealth.length === 0) return null;
  const normalized = skillId.trim().toLowerCase();
  return (
    skillHealth.find((skill) => skill.id.toLowerCase() === normalized) || null
  );
}

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

    const nodeStatus = await gatewayClient.getNodeStatus(nodeId);
    const skillHealth = getSkillHealthForNode(
      nodeStatus?.status?.viber?.skillHealth?.skills,
      skillId,
    );

    if (skillHealth?.available) {
      return json({
        ok: true,
        ready: true,
        skillId,
        nodeId,
        message: `${skillId} is already ready on this node.`,
      });
    }

    const missingChecks = (skillHealth?.checks || [])
      .filter((check) => (check.required ?? true) && !check.ok)
      .map((check) => check.label);

    const setupPrompt = buildCursorAgentSetupPrompt(missingChecks);
    const created = await gatewayClient.createViber(setupPrompt, nodeId);
    if (!created?.viberId) {
      return json(
        { error: "Failed to start setup flow. No node available or gateway unreachable." },
        { status: 503 },
      );
    }

    return json({
      ok: true,
      ready: false,
      skillId,
      nodeId,
      setupViberId: created.viberId,
      message: "Setup flow started. Continue in the opened chat.",
      missingChecks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start skill setup flow";
    console.error("[Skills Provision API]", error);
    return json({ error: message }, { status: 500 });
  }
};

