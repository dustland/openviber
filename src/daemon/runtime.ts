/**
 * Daemon runtime - thin clawdbot-alike assistant path
 *
 * No Space, no DataAdapter, no Storage. Loads a single agent config from file
 * and runs streamText. Viber Board owns persistence and context; daemon only
 * orchestrates local skills and the LLM.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import * as yaml from "yaml";
import { getViberPath } from "../config";
import type { AgentConfig } from "../core/config";
import { Agent } from "../core/agent";
import type { ViberMessage } from "../core/message";

export interface ViberEnvironmentInfo {
  name: string;
  repoUrl?: string;
  repoOrg?: string;
  repoName?: string;
  repoBranch?: string;
  variables?: { key: string; value: string }[];
}

export interface DaemonRunTaskOptions {
  model?: string;
  singleAgentId?: string;
  agentConfig?: AgentConfig;
  signal?: AbortSignal;
  environment?: ViberEnvironmentInfo;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULTS_VIBERS_DIR = path.join(
  path.dirname(__dirname),
  "data",
  "defaults",
  "vibers"
);

/**
 * Load agent config from file (no DataAdapter).
 * Tries built-in defaults then ~/.openviber/vibers/{id}.yaml
 */
export async function loadAgentConfig(
  agentId: string
): Promise<AgentConfig | null> {
  const tryRead = async (filePath: string): Promise<AgentConfig | null> => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = yaml.parse(content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return null;
      return { ...parsed, id: agentId } as AgentConfig;
    } catch {
      return null;
    }
  };

  for (const ext of ["yaml", "yml"]) {
    const fromDefaults = await tryRead(
      path.join(DEFAULTS_VIBERS_DIR, `${agentId}.${ext}`)
    );
    if (fromDefaults) return fromDefaults;
  }

  const root = getViberPath();
  for (const ext of ["yaml", "yml"]) {
    const fromUser = await tryRead(
      path.join(root, "vibers", `${agentId}.${ext}`)
    );
    if (fromUser) return fromUser;
  }

  // Fallback: in-code default so daemon works out of the box (clawdbot-alike)
  if (agentId === "default") {
    return {
      id: "default",
      name: "Default",
      description: "General-purpose assistant with local skills.",
      provider: "openrouter",
      model: "openai/gpt-4o", // Changed from "google/gemini-2.5-flash"
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt:
        "You are a helpful AI assistant. You help users accomplish their tasks efficiently and effectively. Be concise, accurate, and helpful.",
      tools: [],
      skills: ["github", "codex-cli", "tmux"],
    } as AgentConfig;
  }

  return null;
}

/**
 * Build a system prompt section that gives the agent project/environment awareness.
 */
function buildEnvironmentPrompt(env: ViberEnvironmentInfo): string {
  const lines: string[] = [];
  lines.push(`## Environment: ${env.name}`);
  lines.push("");

  if (env.repoUrl && env.repoOrg && env.repoName) {
    const projectDir = `~/openviber_spaces/${env.repoOrg}/${env.repoName}`;
    const branch = env.repoBranch || "main";

    lines.push(`You are working on the project **${env.repoOrg}/${env.repoName}**.`);
    lines.push(`- GitHub repository: ${env.repoUrl}`);
    lines.push(`- Branch: \`${branch}\``);
    lines.push(`- Local project path: \`${projectDir}\``);
    lines.push("");
    lines.push("### Setup instructions");
    lines.push(`1. Check if the project directory exists at \`${projectDir}\`.`);
    lines.push(`2. If it does NOT exist, clone the repository:`);
    lines.push(`   \`\`\`bash`);
    lines.push(`   mkdir -p ~/openviber_spaces/${env.repoOrg}`);
    lines.push(`   cd ~/openviber_spaces/${env.repoOrg}`);
    lines.push(`   git clone ${env.repoUrl} ${env.repoName}`);
    lines.push(`   cd ${env.repoName}`);
    lines.push(`   git checkout ${branch}`);
    lines.push(`   \`\`\``);
    lines.push(`3. If it DOES exist, make sure you are on the \`${branch}\` branch and pull latest changes.`);
    lines.push(`4. Always \`cd\` into \`${projectDir}\` before running any commands.`);
  }

  if (env.variables && env.variables.length > 0) {
    lines.push("");
    lines.push("### Environment variables");
    lines.push("The following environment variables are configured for this project.");
    lines.push("If the project has a `.env.example` file, generate a `.env` file using these values:");
    lines.push("");
    for (const v of env.variables) {
      lines.push(`- \`${v.key}\`=\`${v.value}\``);
    }
    lines.push("");
    lines.push("When generating the `.env` file, match the keys from `.env.example` and fill in the corresponding values from above. Leave any keys not listed above with their example/default values.");
  }

  // Detect GitHub token for gh CLI auth
  const ghTokenVar = env.variables?.find(
    (v) => v.key === "GH_TOKEN" || v.key === "GITHUB_TOKEN",
  );
  if (ghTokenVar) {
    lines.push("");
    lines.push("### GitHub CLI authentication");
    lines.push("A GitHub token is available. Before using `gh` CLI commands (clone, pr create, etc.), export it:");
    lines.push("```bash");
    lines.push(`export GH_TOKEN="${ghTokenVar.value}"`);
    lines.push("```");
    lines.push("This enables `gh repo clone`, `gh pr create`, `gh issue list`, etc.");
  }

  return lines.join("\n");
}

/**
 * Run a single task: one agent, no Space, no storage.
 * Returns stream result and agent for summary.
 */
export async function runTask(
  goal: string,
  options: DaemonRunTaskOptions & { taskId: string },
  messages?: { role: string; content: string }[]
): Promise<{
  streamResult: Awaited<ReturnType<Agent["streamText"]>>;
  agent: Agent;
}> {
  const {
    taskId,
    singleAgentId = "default",
    agentConfig: overrideConfig,
    model: modelOverride,
    signal,
    environment,
  } = options;

  let config = overrideConfig ?? (await loadAgentConfig(singleAgentId));
  if (!config) {
    throw new Error(
      `Agent '${singleAgentId}' not found. Add ~/.openviber/vibers/${singleAgentId}.yaml or use built-in default.`
    );
  }

  if (modelOverride) {
    config = { ...config, model: modelOverride };
  }

  // Inject environment context into system prompt
  if (environment) {
    const envPrompt = buildEnvironmentPrompt(environment);
    const basePrompt = config.systemPrompt || "";
    config = {
      ...config,
      systemPrompt: envPrompt + "\n\n" + basePrompt,
    };
  }

  const agent = new Agent(config as AgentConfig);

  const viberMessages: ViberMessage[] =
    messages && messages.length > 0
      ? messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))
      : [{ role: "user" as const, content: goal }];

  const streamResult = await agent.streamText({
    messages: viberMessages,
    metadata: { taskId },
    ...(signal && { abortSignal: signal }),
  });

  return { streamResult, agent };
}
