/**
 * Daemon runtime - thin assistant runtime path
 *
 * No Space, no DataAdapter, no Storage. Loads a single agent config from file
 * and runs streamText. Viber Board owns persistence and context; daemon only
 * orchestrates local skills and the LLM.
 *
 * Personalization: Loads the four-file pattern (SOUL.md, USER.md, MEMORY.md, IDENTITY.md)
 * from ~/.openviber/ and injects them into every request for agent context.
 * Backwards-compatible: falls back to lowercase filenames and legacy tasks/ paths.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { getViberPath, getViberRoot } from "../worker/config";
import type { ViberConfig } from "../worker/config";
import { Agent } from "../worker/agent";
import { parseModelString } from "../worker/provider";
import { loadSettings, saveSettings } from "../skills/hub/settings";
import type { ViberMessage } from "../worker/message";
import { getModuleDirname } from "../utils/module-path";
import { loadPersonalization, appendDailyMemory, loadRecentDailyLogs } from "./personalization";

// Inlined FsStorage for local runtime usage
class FsStorage {
  protected basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || getViberRoot();
  }

  protected getPath(...segments: string[]): string {
    return path.join(this.basePath, ...segments);
  }

  async readJSON<T = any>(relativePath: string): Promise<T | null> {
    try {
      const fullPath = this.getPath(relativePath);
      const content = await fs.readFile(fullPath, "utf-8");
      return JSON.parse(content) as T;
    } catch (error: any) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async writeJSON(relativePath: string, data: any): Promise<void> {
    const fullPath = this.getPath(relativePath);
    const content = JSON.stringify(data, null, 2);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.getPath(relativePath));
      return true;
    } catch {
      return false;
    }
  }
}

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
  agentConfig?: ViberConfig;
  signal?: AbortSignal;
  environment?: ViberEnvironmentInfo;
  /** Settings from hub (Supabase); overrides local file and updates cache */
  settingsOverride?: { primaryCodingCli?: string; channelIds?: string[]; skills?: string[]; proxyUrl?: string | null; proxyEnabled?: boolean };
  /** OAuth tokens pulled from hub config, injected into tool execution context */
  oauthTokens?: {
    google?: { accessToken: string; refreshToken?: string | null };
    [provider: string]: { accessToken: string; refreshToken?: string | null } | undefined;
  };
  /** Progress callback for tools to emit intermediate updates */
  onProgress?: (event: {
    kind: string;
    phase?: string;
    message?: string;
    data?: any;
  }) => void;
}

const __dirname = getModuleDirname();

const DEFAULTS_VIBERS_DIR = path.join(
  path.dirname(__dirname),
  "data",
  "defaults",
  "vibers"
);


// ==================== Coding Task System Prompt ====================

/**
 * System prompt for AI coding tasks.
 *
 * Follows best practices for agentic coding workflows:
 * 1. Plan before coding
 * 2. Implement incrementally
 * 3. Verify changes (tests, lint, typecheck)
 * 4. Report with evidence
 * 5. Git best practices (branch, commit, push)
 */
const CODING_TASK_SYSTEM_PROMPT = `You are an expert software engineering assistant. You work autonomously to complete coding tasks end-to-end.

## Workflow (MANDATORY for coding tasks)

Follow this systematic approach for every coding task:

### 1. UNDERSTAND
- Read the task/issue carefully. Identify acceptance criteria.
- Explore the codebase: read relevant files, understand the architecture.
- Check for existing patterns, conventions, and test suites.

### 2. PLAN
- Break the task into small, concrete steps.
- Identify which files need changes and why.
- Consider edge cases and potential regressions.
- If the task is ambiguous, state your interpretation before proceeding.

### 3. IMPLEMENT
- Make changes incrementally — one logical change at a time.
- Follow existing code style and conventions.
- Add or update tests alongside code changes.
- Keep changes minimal and focused on the task.

### 4. VERIFY
- Run the project's test suite after making changes.
- Run linting and type checking if available.
- Review your own changes for correctness and completeness.
- If tests fail, debug and fix before proceeding.

### 5. COMMIT & REPORT
- Use descriptive commit messages (conventional commits preferred).
- Summarize what was changed, why, and any caveats.
- Reference issue numbers when applicable.
- Report evidence: test results, lint output, before/after behavior.

## Git Best Practices

- Create feature branches for changes (e.g. \`fix/issue-123\`, \`feat/add-widget\`).
- Make small, focused commits — one logical change per commit.
- Write clear commit messages: \`type(scope): description\`
- Push changes and create PRs when appropriate.
- Never force-push to shared branches without explicit permission.

## Tool Usage

- **IMPORTANT**: Before saying you cannot do something, always check your available tools first. You likely have tools that can accomplish what is being asked. Never claim you lack capabilities without first reviewing the tools provided to you.
- Use tools proactively to explore the codebase before making changes.
- When delegating to Cursor Agent CLI, provide clear, specific prompts.
- When using GitHub tools, follow the clone → branch → fix → commit → PR workflow.
- Verify tool results before proceeding to the next step.

## Communication

- Be concise but thorough in status updates.
- Show your reasoning when making architectural decisions.
- Flag risks, trade-offs, or areas needing human review.
- If you get stuck, explain what you tried and where you're blocked.
`;

// ==================== Config Loading ====================

/**
 * Load agent config from file (no DataAdapter).
 * Tries built-in defaults then ~/.openviber/viber.yaml (single-machine mode)
 * and finally legacy ~/.openviber/vibers/{id}.yaml.
 */
export async function loadViberConfig(
  agentId: string
): Promise<ViberConfig | null> {
  const tryRead = async (filePath: string): Promise<ViberConfig | null> => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = yaml.parse(content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return null;
      return { ...parsed, id: agentId } as ViberConfig;
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
  for (const fileName of ["viber.yaml", "viber.yml"]) {
    const singleMachineConfig = await tryRead(path.join(root, fileName));
    if (singleMachineConfig) {
      return { ...singleMachineConfig, id: agentId } as ViberConfig;
    }
  }

  for (const ext of ["yaml", "yml"]) {
    const fromUser = await tryRead(
      path.join(root, "vibers", `${agentId}.${ext}`)
    );
    if (fromUser) return fromUser;
  }

  // Fallback: in-code default so daemon works out of the box
  if (agentId === "default") {
    return {
      id: "default",
      name: "Default",
      description: "General-purpose coding assistant with local skills.",
      provider: "openrouter",
      model: "anthropic/claude-3.5-sonnet",
      temperature: 0.7,
      maxTokens: 16384,
      maxSteps: 25,
      systemPrompt: CODING_TASK_SYSTEM_PROMPT,
      tools: [],
      skills: ["github", "codex-cli", "cursor-agent", "terminal", "skill-playground"],
    } as ViberConfig;
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
 * Build the complete system prompt for a daemon task.
 *
 * Layers (in order):
 * 1. Personalization (SOUL.md, USER.md, MEMORY.md, IDENTITY.md) — if configured
 * 2. Environment context (repo, branch, variables) — if provided
 * 3. Agent's own system prompt (from config)
 */
async function buildDaemonSystemPrompt(
  config: ViberConfig,
  agentId: string,
  environment?: ViberEnvironmentInfo,
): Promise<string> {
  const sections: string[] = [];

  // 1. Personalization
  try {
    const personalization = await loadPersonalization(agentId);
    if (personalization) {
      sections.push(personalization);
    }
  } catch (err) {
    console.warn("[Runtime] Failed to load personalization:", err);
  }

  // 2. Environment context
  if (environment) {
    sections.push(buildEnvironmentPrompt(environment));
  }

  // 3. Agent system prompt
  if (config.systemPrompt) {
    sections.push(config.systemPrompt);
  }

  return sections.join("\n\n");
}

/**
 * Run a single task: one agent, no Space, no storage.
 * Returns stream result and agent for summary.
 *
 * Loads personalization context, environment info, and agent config
 * then streams the response via AI SDK.
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

  let oauthTokens = options.oauthTokens;
  if (!oauthTokens) {
    try {
      const settings = await loadSettings();
      oauthTokens = settings.oauthTokens;
    } catch (err) {
      console.warn("[Runtime] Failed to load settings for oauthTokens:", err);
    }
  }

  let config = overrideConfig ?? (await loadViberConfig(singleAgentId));
  if (!config) {
    throw new Error(
      `Agent '${singleAgentId}' not found. Add ~/.openviber/viber.yaml (or legacy ~/.openviber/vibers/${singleAgentId}.yaml) or use built-in default.`
    );
  }

  if (modelOverride) {
    const parsed = parseModelString(modelOverride);
    config = { ...config, provider: parsed.provider, model: parsed.modelName };
  }

  // Primary coding CLI: prefer override from hub (Supabase), else local cache file; update cache when override provided
  try {
    const override = options.settingsOverride?.primaryCodingCli;
    if (override != null && override !== "") {
      config = { ...config, primaryCodingCli: override };
      const cache = await loadSettings();
      cache.primaryCodingCli = override;
      await saveSettings(cache);
    } else {
      const settings = await loadSettings();
      if (settings.primaryCodingCli != null) {
        config = { ...config, primaryCodingCli: settings.primaryCodingCli };
      }
    }
  } catch (err) {
    console.warn("[Runtime] Failed to load settings for primaryCodingCli:", err);
  }

  // Merge additional skills from intent/settings override into the agent config
  let extraSkills = options.settingsOverride?.skills;
  if (!extraSkills || extraSkills.length === 0) {
    try {
      const settings = await loadSettings();
      extraSkills = settings.standaloneSkills;
    } catch (err) {
      console.warn("[Runtime] Failed to load settings for standaloneSkills:", err);
    }
  }

  if (extraSkills && extraSkills.length > 0) {
    const existing = new Set(config.skills ?? []);
    const merged = [...(config.skills ?? [])];
    for (const s of extraSkills) {
      if (!existing.has(s)) {
        merged.push(s);
        existing.add(s);
      }
    }
    config = { ...config, skills: merged };
  }

  // Build the full system prompt with personalization + environment + agent prompt
  const systemPrompt = await buildDaemonSystemPrompt(
    config,
    singleAgentId,
    environment,
  );
  config = { ...config, systemPrompt: systemPrompt };

  const agent = new Agent(config as ViberConfig);

  // Set up proxy-aware fetch if configured
  try {
    const proxyUrl = options.settingsOverride?.proxyUrl;
    const proxyEnabled = options.settingsOverride?.proxyEnabled;
    if (proxyUrl && proxyEnabled) {
      const { createProxyFetch } = await import("../utils/proxy");
      agent.proxyFetch = createProxyFetch({ proxyUrl, proxyEnabled });
      console.log(`[Runtime] Proxy enabled: ${proxyUrl}`);
    }
  } catch (err) {
    console.warn("[Runtime] Failed to set up proxy fetch:", err);
  }

  const viberMessages: ViberMessage[] =
    messages && messages.length > 0
      ? messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))
      : [{ role: "user" as const, content: goal }];

  const streamResult = await agent.streamText({
    messages: viberMessages,
    metadata: {
      taskId,
      oauthTokens,
      onProgress: options.onProgress,
    },
    ...(signal && { abortSignal: signal }),
  });

  return { streamResult, agent };
}
