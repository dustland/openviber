import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { defaultRegistry } from "./registry";

export type SkillHealthStatus = "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";

/**
 * Classifies what kind of interactive action can resolve a failing check.
 *
 * - `"env"` — Missing environment variable (prompt user to paste a key)
 * - `"oauth"` — OAuth connection needed (run browser/headless OAuth flow)
 * - `"binary"` — CLI binary not found (show install command, offer retry)
 * - `"auth_cli"` — CLI auth needed (show login command, offer retry)
 * - `"manual"` — Requires manual/external setup (show hint only)
 */
export type HealthCheckActionType = "env" | "oauth" | "binary" | "auth_cli" | "manual";

export interface SkillHealthCheck {
  id: string;
  label: string;
  ok: boolean;
  required?: boolean;
  message?: string;
  hint?: string;
  /** What kind of interactive action can resolve this check (for onboarding wizard). */
  actionType?: HealthCheckActionType;
}

export interface SkillHealthResult {
  id: string;
  name: string;
  status: SkillHealthStatus;
  available: boolean;
  checks: SkillHealthCheck[];
  summary: string;
}

export interface SkillHealthReport {
  generatedAt: string;
  skills: SkillHealthResult[];
}

export interface SkillInfo {
  id: string;
  name?: string;
  description?: string;
}

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number | null;
  error?: string;
};

const COMMAND_TIMEOUT_MS = 3000;
const DEFAULT_SKILL_IDS = [
  "antigravity",
  "cursor-agent",
  "codex-cli",
  "gemini-cli",
  "github",
  "gmail",
  "railway",
  "system-info",
  "sys-telemetry",
  "terminal",
] as const;

function formatFirstLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function resolveExecutableCandidates(command: string): string[] {
  if (process.platform === "win32") {
    return [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`];
  }
  return [command];
}

function findExecutable(command: string): string | null {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidates = resolveExecutableCandidates(command);
  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = path.join(entry, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function resolveCommand(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (findExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number = COMMAND_TIMEOUT_MS,
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: timeoutMs,
  });

  const stdout = result.stdout ? String(result.stdout) : "";
  const stderr = result.stderr ? String(result.stderr) : "";
  if (result.error) {
    return {
      ok: false,
      stdout,
      stderr,
      exitCode: result.status,
      error: result.error.message,
    };
  }

  return {
    ok: result.status === 0,
    stdout,
    stderr,
    exitCode: result.status,
  };
}

function buildResult(skill: SkillInfo, checks: SkillHealthCheck[]): SkillHealthResult {
  if (checks.length === 0) {
    return {
      id: skill.id,
      name: skill.name || skill.id,
      status: "UNKNOWN",
      available: false,
      checks,
      summary: "No automated health checks defined.",
    };
  }

  const failedRequired = checks.filter((check) => (check.required ?? true) && !check.ok);
  const available = failedRequired.length === 0;
  const status: SkillHealthStatus = available ? "AVAILABLE" : "NOT_AVAILABLE";
  const summary = available
    ? "All prerequisites satisfied."
    : `Missing: ${failedRequired.map((check) => check.label).join(", ")}`;

  return {
    id: skill.id,
    name: skill.name || skill.id,
    status,
    available,
    checks,
    summary,
  };
}

function buildCommandCheck(args: {
  id: string;
  label: string;
  candidates: string[];
  hint: string;
}): { command: string | null; check: SkillHealthCheck } {
  const command = resolveCommand(args.candidates);
  return {
    command,
    check: {
      id: args.id,
      label: args.label,
      ok: !!command,
      required: true,
      message: command ? `Found: ${command}` : "Not found in PATH",
      hint: command ? undefined : args.hint,
      actionType: "binary",
    },
  };
}

function buildEnvCheck(args: {
  id: string;
  label: string;
  envVars: string[];
  hint: string;
  actionType?: HealthCheckActionType;
}): SkillHealthCheck {
  const found = args.envVars.find((key) => !!process.env[key]?.trim());
  return {
    id: args.id,
    label: args.label,
    ok: !!found,
    required: true,
    message: found ? `${found} set` : `${args.envVars.join(" or ")} not set`,
    hint: found ? undefined : args.hint,
    actionType: args.actionType ?? "env",
  };
}

function buildAuthCheck(args: {
  id: string;
  label: string;
  envVars?: string[];
  command?: string | null;
  commandArgs?: string[];
  hint: string;
}): SkillHealthCheck {
  const envCheck =
    args.envVars && args.envVars.length > 0
      ? buildEnvCheck({
        id: args.id,
        label: args.label,
        envVars: args.envVars,
        hint: args.hint,
        actionType: "auth_cli",
      })
      : null;

  if (envCheck?.ok) {
    return envCheck;
  }

  if (!args.command || !args.commandArgs) {
    return {
      id: args.id,
      label: args.label,
      ok: false,
      required: true,
      message: "Authentication not verified",
      hint: args.hint,
      actionType: "auth_cli",
    };
  }

  const result = runCommand(args.command, args.commandArgs);
  if (result.ok) {
    return {
      id: args.id,
      label: args.label,
      ok: true,
      required: true,
      message: "Authenticated via CLI",
      actionType: "auth_cli",
    };
  }

  const detail = formatFirstLine(result.error || result.stderr) || "Not authenticated";
  return {
    id: args.id,
    label: args.label,
    ok: false,
    required: true,
    message: detail,
    hint: args.hint,
    actionType: "auth_cli",
  };
}

async function checkAntigravityHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const portRaw = process.env.OPENVIBER_ANTIGRAVITY_PORT || "9333";
  const port = Number.isFinite(Number(portRaw)) ? Number(portRaw) : 9333;
  const url = `http://127.0.0.1:${port}/json/version`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  let ok = false;
  let message = "";
  try {
    const res = await fetch(url, { signal: controller.signal });
    ok = res.ok;
    if (!res.ok) {
      message = `HTTP ${res.status}`;
    }
  } catch (err: any) {
    message = formatFirstLine(err?.message || String(err));
  } finally {
    clearTimeout(timeout);
  }

  const checks: SkillHealthCheck[] = [
    {
      id: "cdp",
      label: `CDP endpoint reachable (port ${port})`,
      ok,
      required: true,
      message: ok ? "Reachable" : message || "Not reachable",
      hint: ok
        ? undefined
        : `Start Chrome with --remote-debugging-port=${port}`,
      actionType: "manual",
    },
  ];

  return buildResult(skill, checks);
}

async function checkCursorAgentHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const commandCheck = buildCommandCheck({
    id: "cursor-cli",
    label: "Cursor CLI installed",
    candidates: ["agent", "cursor-agent"],
    hint: "Install with: curl https://cursor.com/install -fsS | bash",
  });
  const tmuxCheck = buildCommandCheck({
    id: "tmux",
    label: "Terminal backend (tmux) installed",
    candidates: ["tmux"],
    hint: "Install with: brew install tmux (macOS) or sudo apt install tmux",
  });
  const authCheck = buildAuthCheck({
    id: "cursor-auth",
    label: "Cursor auth",
    envVars: ["CURSOR_API_KEY"],
    command: commandCheck.command,
    commandArgs: ["auth", "status"],
    hint: "Run `agent login` or set CURSOR_API_KEY",
  });

  return buildResult(skill, [commandCheck.check, tmuxCheck.check, authCheck]);
}

async function checkCodexHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const commandCheck = buildCommandCheck({
    id: "codex-cli",
    label: "Codex CLI installed",
    candidates: ["codex"],
    hint: "Install with: pnpm add -g @openai/codex",
  });
  const authCheck = buildAuthCheck({
    id: "codex-auth",
    label: "Codex auth",
    envVars: ["OPENAI_API_KEY"],
    command: commandCheck.command,
    commandArgs: ["auth", "status"],
    hint: "Run `codex login` or set OPENAI_API_KEY",
  });

  return buildResult(skill, [commandCheck.check, authCheck]);
}

async function checkGeminiHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const commandCheck = buildCommandCheck({
    id: "gemini-cli",
    label: "Gemini CLI installed",
    candidates: ["gemini"],
    hint: "Install with: pnpm add -g @google/gemini-cli",
  });

  // Check env vars first, then ~/.gemini/oauth_creds.json (web-injected or
  // CLI-native tokens), then fall back to `gemini auth status`.
  let authCheck: SkillHealthCheck;
  const envOk =
    !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (envOk) {
    authCheck = {
      id: "gemini-auth",
      label: "Gemini auth",
      ok: true,
      required: true,
      message: "Authenticated via environment variable",
      actionType: "auth_cli",
    };
  } else {
    // Try file-based credential detection (fast, no subprocess)
    try {
      const { hasGeminiCredentials } = await import("./gemini-cli/gemini-auth");
      if (hasGeminiCredentials()) {
        authCheck = {
          id: "gemini-auth",
          label: "Gemini auth",
          ok: true,
          required: true,
          message: "Authenticated via OAuth credentials",
          actionType: "auth_cli",
        };
      } else {
        throw new Error("no creds");
      }
    } catch {
      // Fall back to CLI auth status command
      authCheck = buildAuthCheck({
        id: "gemini-auth",
        label: "Gemini auth",
        envVars: [],
        command: commandCheck.command,
        commandArgs: ["auth", "status"],
        hint: "Run `gemini` to login or set GEMINI_API_KEY",
      });
    }
  }

  return buildResult(skill, [commandCheck.check, authCheck]);
}

async function checkGithubHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const commandCheck = buildCommandCheck({
    id: "gh-cli",
    label: "GitHub CLI installed",
    candidates: ["gh"],
    hint: "Install with: brew install gh",
  });
  const authCheck = buildAuthCheck({
    id: "gh-auth",
    label: "GitHub auth",
    envVars: ["GH_TOKEN", "GITHUB_TOKEN"],
    command: commandCheck.command,
    commandArgs: ["auth", "status", "-h", "github.com"],
    hint: "Run `gh auth login` or set GH_TOKEN",
  });

  return buildResult(skill, [commandCheck.check, authCheck]);
}

async function checkRailwayHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const commandCheck = buildCommandCheck({
    id: "railway-cli",
    label: "Railway CLI installed",
    candidates: ["railway"],
    hint: "Install with: pnpm add -g @railway/cli",
  });
  const authCheck = buildAuthCheck({
    id: "railway-auth",
    label: "Railway auth",
    envVars: ["RAILWAY_TOKEN"],
    command: commandCheck.command,
    commandArgs: ["whoami"],
    hint: "Run `railway login` or set RAILWAY_TOKEN",
  });

  return buildResult(skill, [commandCheck.check, authCheck]);
}

async function checkTerminalHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const commandCheck = buildCommandCheck({
    id: "tmux",
    label: "Terminal backend (tmux) installed",
    candidates: ["tmux"],
    hint: "Install with: brew install tmux (macOS) or sudo apt install tmux",
  });
  return buildResult(skill, [commandCheck.check]);
}

async function checkGmailHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  // Gmail uses Google OAuth.  Three ways to satisfy this:
  //  1. Connected mode: tokens in Supabase (requires GOOGLE_CLIENT_ID on the web server)
  //  2. Standalone: local OAuth tokens in settings.yaml
  //  3. Standalone: tokens passed via CLI flags

  // Check for local OAuth tokens first (standalone mode)
  let hasLocalTokens = false;
  try {
    const { loadSettings } = await import("./hub/settings");
    const settings = await loadSettings();
    hasLocalTokens = !!settings.oauthTokens?.google?.accessToken;
  } catch {
    // settings load failed — skip
  }

  if (hasLocalTokens) {
    return buildResult(skill, [
      {
        id: "google-oauth",
        label: "Google OAuth",
        ok: true,
        required: true,
        message: "Local OAuth tokens configured",
        actionType: "oauth",
      },
    ]);
  }

  // Fall back to checking for server-side OAuth config or env vars
  const hasClientId = !!process.env.GOOGLE_CLIENT_ID?.trim();
  return buildResult(skill, [
    {
      id: "google-oauth",
      label: "Google OAuth",
      ok: hasClientId,
      required: true,
      message: hasClientId
        ? "GOOGLE_CLIENT_ID set — connect via web or run `viber auth google`"
        : "Google account not connected",
      hint: hasClientId
        ? undefined
        : "Run `viber auth google` to connect your Google account",
      actionType: "oauth",
    },
  ]);
}

async function checkSystemInfoHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  // No external deps — always available (uses only Node.js os module)
  return buildResult(skill, [
    {
      id: "nodejs-os",
      label: "Node.js os module",
      ok: true,
      required: true,
      message: "Built-in module always available",
    },
  ]);
}

const SKILL_CHECKERS: Record<
  string,
  (skill: SkillInfo) => Promise<SkillHealthResult>
> = {
  antigravity: checkAntigravityHealth,
  "cursor-agent": checkCursorAgentHealth,
  "codex-cli": checkCodexHealth,
  "gemini-cli": checkGeminiHealth,
  github: checkGithubHealth,
  gmail: checkGmailHealth,
  railway: checkRailwayHealth,
  "system-info": checkSystemInfoHealth,
  "sys-telemetry": checkSystemInfoHealth,
  terminal: checkTerminalHealth,
};

/**
 * Load all installed skills and return their metadata for health checks.
 */
export async function getInstalledSkills(): Promise<SkillInfo[]> {
  await defaultRegistry.loadAll();
  const skills = defaultRegistry.getAllSkills();
  const merged = new Map<string, SkillInfo>();

  for (const skill of skills) {
    merged.set(skill.id, {
      id: skill.id,
      name: skill.metadata?.name || skill.id,
      description: skill.metadata?.description || "",
    });
  }

  for (const id of DEFAULT_SKILL_IDS) {
    if (!merged.has(id)) {
      merged.set(id, { id, name: id, description: "" });
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

/**
 * Run a health check for a single skill.
 */
export async function checkSkillHealth(skill: SkillInfo): Promise<SkillHealthResult> {
  const checker = SKILL_CHECKERS[skill.id];
  if (!checker) {
    return buildResult(skill, []);
  }
  return checker(skill);
}

/**
 * Run health checks for a list of skills.
 */
export async function checkSkillsHealth(
  skills: SkillInfo[],
): Promise<SkillHealthReport> {
  const results: SkillHealthResult[] = [];
  for (const skill of skills) {
    results.push(await checkSkillHealth(skill));
  }
  return {
    generatedAt: new Date().toISOString(),
    skills: results,
  };
}

/**
 * Convenience helper: load installed skills and return their health report.
 */
export async function getSkillHealthReport(): Promise<SkillHealthReport> {
  const skills = await getInstalledSkills();
  return checkSkillsHealth(skills);
}
