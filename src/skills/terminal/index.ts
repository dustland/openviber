/**
 * Terminal skill — persistent terminal session management.
 *
 * Provides tools to create, manage, and monitor terminal sessions.
 * Uses tmux under the hood for persistent PTY sessions that can be
 * attached to from the web UI or CLI.
 *
 * End users interact with "terminal sessions" — tmux is an implementation
 * detail they never need to know about.
 */

import { z } from "zod";
import { execSync, spawnSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import {
  checkSkillHealth,
  type SkillHealthCheck,
  type SkillHealthResult,
} from "../health";

const SAFE_RE = /[^a-zA-Z0-9_.:-]/g;
const SKILL_SETUP_IDS = [
  "cursor-agent",
  "codex-cli",
  "gemini-cli",
  "github",
  "railway",
  "terminal",
] as const;
const DEFAULT_SETUP_SESSION = "skill-setup";
const DEFAULT_SETUP_WAIT_SECONDS = 120;
const MIN_SETUP_WAIT_SECONDS = 10;
const MAX_SETUP_WAIT_SECONDS = 900;
const SETUP_POLL_INTERVAL_SECONDS = 3;

type SkillSetupId = (typeof SKILL_SETUP_IDS)[number];
type SkillSetupMode = "plan" | "apply";
type InstallEnv = {
  hasBrew: boolean;
  hasApt: boolean;
  hasCurl: boolean;
  isRoot: boolean;
};

type SkillSetupStep = {
  checkId: string;
  label: string;
  kind: "install" | "auth" | "manual";
  status: "planned" | "completed" | "failed" | "pending" | "skipped";
  command?: string;
  message?: string;
  outputTail?: string;
};

/**
 * Sanitize a target string to prevent shell injection.
 */
function safeTarget(t: string): string {
  return t.replace(SAFE_RE, "-");
}

function hasCommand(command: string): boolean {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidates =
    process.platform === "win32"
      ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
      : [command];

  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(entry, candidate))) {
        return true;
      }
    }
  }
  return false;
}

function detectInstallEnv(): InstallEnv {
  const isRoot = typeof process.getuid === "function" ? process.getuid() === 0 : false;
  return {
    hasBrew: hasCommand("brew"),
    hasApt: hasCommand("apt-get"),
    hasCurl: hasCommand("curl"),
    isRoot,
  };
}

function selectInstallCommand(checkId: string, env: InstallEnv): string | null {
  switch (checkId) {
    case "codex-cli":
      return "pnpm add -g @openai/codex";
    case "gemini-cli":
      return "pnpm add -g @google/gemini-cli";
    case "railway-cli":
      return "pnpm add -g @railway/cli";
    case "cursor-cli":
      if (env.hasCurl) return "curl https://cursor.com/install -fsS | bash";
      if (env.hasBrew) return "brew install --cask cursor-cli";
      return null;
    case "gh-cli":
      if (env.hasBrew) return "brew install gh";
      if (env.hasApt && env.isRoot) return "apt-get update && apt-get install -y gh";
      return null;
    case "tmux":
      if (env.hasBrew) return "brew install tmux";
      if (env.hasApt && env.isRoot) return "apt-get update && apt-get install -y tmux";
      return null;
    default:
      return null;
  }
}

function resolveFirstAvailable(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (hasCommand(candidate)) {
      return candidate;
    }
  }
  return null;
}

function selectAuthCommand(
  checkId: string,
  resolveCommand: (candidates: string[]) => string | null = resolveFirstAvailable,
): string | null {
  switch (checkId) {
    case "cursor-auth": {
      const cursor = resolveCommand(["agent", "cursor-agent"]);
      return cursor ? `${cursor} login` : null;
    }
    case "codex-auth": {
      const codex = resolveCommand(["codex"]);
      return codex ? `${codex} login` : null;
    }
    case "gemini-auth": {
      const gemini = resolveCommand(["gemini"]);
      return gemini;
    }
    case "gh-auth": {
      const gh = resolveCommand(["gh"]);
      return gh ? `${gh} auth login -h github.com` : null;
    }
    case "railway-auth": {
      const railway = resolveCommand(["railway"]);
      return railway ? `${railway} login` : null;
    }
    default:
      return null;
  }
}

function getMissingRequiredChecks(result: SkillHealthResult): SkillHealthCheck[] {
  return result.checks.filter((check) => (check.required ?? true) && !check.ok);
}

function trimOutput(raw: string, maxChars = 4000): string {
  if (!raw) return "";
  const text = raw.trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]...`;
}

function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs = 300_000,
): { ok: boolean; stdout: string; stderr: string; error?: string } {
  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      stdio: "pipe",
      cwd,
      timeout: timeoutMs,
    });
    return { ok: true, stdout: trimOutput(stdout), stderr: "" };
  } catch (err: any) {
    return {
      ok: false,
      stdout: trimOutput(err?.stdout ? String(err.stdout) : ""),
      stderr: trimOutput(err?.stderr ? String(err.stderr) : ""),
      error: err?.message || String(err),
    };
  }
}

function startAuthFlowInTerminal(args: {
  sessionName: string;
  command: string;
  cwd: string;
}): { sessionName: string; target: string } {
  const sessionName = safeTarget(args.sessionName);
  execSync(
    `tmux has-session -t '${sessionName}' 2>/dev/null || tmux new-session -d -s '${sessionName}'`,
    { encoding: "utf8", stdio: "pipe" },
  );

  const cdCmd = args.cwd.includes(" ")
    ? `cd "${args.cwd.replace(/"/g, '\\"')}"`
    : `cd ${args.cwd}`;
  spawnSync("tmux", ["send-keys", "-t", sessionName, cdCmd, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  spawnSync("tmux", ["send-keys", "-t", sessionName, args.command, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  return {
    sessionName,
    target: `${sessionName}:0.0`,
  };
}

async function waitForCheckToPass(args: {
  skillId: SkillSetupId;
  checkId: string;
  waitSeconds: number;
}): Promise<{ passed: boolean; latest: SkillHealthResult }> {
  const timeoutSeconds = Math.max(MIN_SETUP_WAIT_SECONDS, args.waitSeconds);
  const startedAt = Date.now();
  let latest = await checkSkillHealth({ id: args.skillId });

  while (Date.now() - startedAt < timeoutSeconds * 1000) {
    const check = latest.checks.find((item) => item.id === args.checkId);
    if (check?.ok) {
      return { passed: true, latest };
    }
    await sleep(SETUP_POLL_INTERVAL_SECONDS);
    latest = await checkSkillHealth({ id: args.skillId });
  }

  return { passed: false, latest };
}

/**
 * Sleep for a given number of seconds using a non-blocking timer.
 */
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, seconds) * 1000));
}

/**
 * Check whether tmux is available on this system.
 */
function isTmuxInstalled(): { installed: boolean; version?: string } {
  try {
    const out = execSync("tmux -V", { encoding: "utf8", stdio: "pipe" });
    return { installed: true, version: out.trim() };
  } catch {
    return { installed: false };
  }
}

/**
 * Capture the current contents of a terminal pane via tmux.
 * Tries ANSI-aware capture first, falls back to plain capture.
 * Throws if all capture strategies fail (e.g. pane does not exist).
 */
function capturePaneOutput(target: string, lines = 200): string {
  const cmds = [
    `tmux capture-pane -t '${target}' -pae -S -${lines}`,
    `tmux capture-pane -t '${target}' -pe -S -${lines}`,
    `tmux capture-pane -t '${target}' -p -S -${lines}`,
  ];
  let lastError: Error | undefined;
  for (const cmd of cmds) {
    try {
      return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`Failed to capture pane: ${target}`);
}

/**
 * Run a command inside a terminal session and capture pane output.
 * Creates the session if it does not exist.
 */
async function runInSession(
  sessionName: string,
  command: string,
  cwd: string,
  waitSeconds: number,
): Promise<string> {
  const safeSession = safeTarget(sessionName);
  execSync(
    `tmux has-session -t '${safeSession}' 2>/dev/null || tmux new-session -d -s '${safeSession}'`,
    { encoding: "utf8", stdio: "pipe" },
  );

  const cdCmd = cwd.includes(" ")
    ? `cd "${cwd.replace(/"/g, '\\"')}"`
    : `cd ${cwd}`;
  spawnSync("tmux", ["send-keys", "-t", safeSession, cdCmd, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  spawnSync("tmux", ["send-keys", "-t", safeSession, command, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  await sleep(waitSeconds);

  return capturePaneOutput(safeSession);
}

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    // ==================== Health check ====================

    terminal_check: {
      description:
        "Check if the terminal backend is available and return its version. Call before using any other terminal_* tool to ensure the system is ready.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = isTmuxInstalled();
        if (result.installed) {
          return { available: true, backend: "tmux", version: result.version };
        }
        return {
          available: false,
          hint: "Terminal backend (tmux) not found. Install with: brew install tmux (macOS) or sudo apt install tmux (Ubuntu)",
        };
      },
    },

    terminal_prepare_skill_prerequisites: {
      description:
        "Prepare prerequisites for built-in CLI skills using terminal automation. Use mode='plan' to preview actions, then mode='apply' to install missing CLIs and run interactive auth flows in a terminal session.",
      inputSchema: z.object({
        skillId: z
          .enum(SKILL_SETUP_IDS)
          .describe("Skill to prepare (cursor-agent, codex-cli, gemini-cli, github, railway, terminal)."),
        mode: z
          .enum(["plan", "apply"])
          .optional()
          .default("plan")
          .describe("plan: preview actions only; apply: execute install/auth actions."),
        runAuthFlow: z
          .boolean()
          .optional()
          .default(true)
          .describe("When true, start interactive auth commands in a terminal session."),
        sessionName: z
          .string()
          .optional()
          .default(DEFAULT_SETUP_SESSION)
          .describe("Terminal session name used for interactive auth flows."),
        waitSeconds: z
          .number()
          .int()
          .min(MIN_SETUP_WAIT_SECONDS)
          .max(MAX_SETUP_WAIT_SECONDS)
          .optional()
          .default(DEFAULT_SETUP_WAIT_SECONDS)
          .describe("How long to wait for interactive auth to complete before returning pending."),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for install/auth commands (defaults to process cwd)."),
      }),
      execute: async (args: {
        skillId: SkillSetupId;
        mode?: SkillSetupMode;
        runAuthFlow?: boolean;
        sessionName?: string;
        waitSeconds?: number;
        cwd?: string;
      }) => {
        const mode = args.mode ?? "plan";
        const waitSeconds = Math.min(
          MAX_SETUP_WAIT_SECONDS,
          Math.max(MIN_SETUP_WAIT_SECONDS, args.waitSeconds ?? DEFAULT_SETUP_WAIT_SECONDS),
        );
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const runAuthFlow = args.runAuthFlow !== false;
        const installEnv = detectInstallEnv();

        const healthSkillId = args.skillId === "terminal" ? "terminal" : args.skillId;
        const before = await checkSkillHealth({ id: healthSkillId });
        const missing = getMissingRequiredChecks(before);
        if (missing.length === 0) {
          return {
            ok: true,
            skillId: args.skillId,
            mode,
            before,
            after: before,
            steps: [] as SkillSetupStep[],
            summary: "All prerequisites are already satisfied.",
          };
        }

        const steps: SkillSetupStep[] = [];
        let latest = before;
        let authSessionName: string | undefined;
        let authTarget: string | undefined;

        for (const check of missing) {
          const installCommand = selectInstallCommand(check.id, installEnv);
          if (installCommand) {
            if (mode === "plan") {
              steps.push({
                checkId: check.id,
                label: check.label,
                kind: "install",
                status: "planned",
                command: installCommand,
                message: "This command will be executed in apply mode.",
              });
              continue;
            }

            const result = runShellCommand(installCommand, cwd);
            const outputTail = trimOutput(
              [result.stdout, result.stderr].filter(Boolean).join("\n"),
              1500,
            );
            steps.push({
              checkId: check.id,
              label: check.label,
              kind: "install",
              status: result.ok ? "completed" : "failed",
              command: installCommand,
              message: result.ok
                ? "Install command completed."
                : result.error || "Install command failed.",
              outputTail: outputTail || undefined,
            });
            latest = await checkSkillHealth({ id: healthSkillId });
            continue;
          }

          const authCommand = runAuthFlow ? selectAuthCommand(check.id) : null;
          if (authCommand) {
            if (mode === "plan") {
              steps.push({
                checkId: check.id,
                label: check.label,
                kind: "auth",
                status: "planned",
                command: authCommand,
                message: "Interactive auth will be launched in a terminal session in apply mode.",
              });
              continue;
            }

            try {
              const authFlow = startAuthFlowInTerminal({
                sessionName: args.sessionName || DEFAULT_SETUP_SESSION,
                command: authCommand,
                cwd,
              });
              authSessionName = authFlow.sessionName;
              authTarget = authFlow.target;

              const waited = await waitForCheckToPass({
                skillId: args.skillId,
                checkId: check.id,
                waitSeconds,
              });
              latest = waited.latest;

              steps.push({
                checkId: check.id,
                label: check.label,
                kind: "auth",
                status: waited.passed ? "completed" : "pending",
                command: authCommand,
                message: waited.passed
                  ? `Authentication completed via terminal session '${authFlow.sessionName}'.`
                  : `Authentication still pending. Continue in terminal target '${authFlow.target}'.`,
              });
            } catch (err: any) {
              steps.push({
                checkId: check.id,
                label: check.label,
                kind: "auth",
                status: "failed",
                command: authCommand,
                message: err?.message || String(err),
              });
            }
            continue;
          }

          steps.push({
            checkId: check.id,
            label: check.label,
            kind: "manual",
            status: "skipped",
            message:
              check.hint ||
              check.message ||
              "No automated action is available for this requirement.",
          });
        }

        const after = mode === "apply" ? latest : before;
        const remaining = getMissingRequiredChecks(after);
        const pendingAuth = steps.some(
          (step) => step.kind === "auth" && step.status === "pending",
        );

        const summary =
          mode === "plan"
            ? `Planned ${steps.length} action(s) for ${args.skillId}.`
            : remaining.length === 0
              ? "All required prerequisites are satisfied."
              : pendingAuth
                ? "Setup is partially complete. User input is still required in terminal."
                : "Setup finished with unresolved checks.";

        return {
          ok: remaining.length === 0,
          skillId: args.skillId,
          mode,
          before,
          after,
          steps,
          remainingChecks: remaining.map((check) => ({
            id: check.id,
            label: check.label,
            hint: check.hint,
            message: check.message,
          })),
          requiresUserInput: pendingAuth,
          ...(authSessionName
            ? {
                authSession: authSessionName,
                authTarget,
                authHint:
                  "Use terminal_send_keys/terminal_read (or attach locally) to complete interactive login.",
              }
            : {}),
          summary,
        };
      },
    },

    // ==================== Session management ====================

    terminal_new_session: {
      description:
        "Create a new persistent terminal session. Use when the user asks to set up a coding session, workspace, or multi-terminal layout. Sessions persist even when disconnected.",
      inputSchema: z.object({
        sessionName: z.string().describe("Session name (e.g. 'coding', 'dev')"),
        firstWindowName: z
          .string()
          .optional()
          .describe("Name for the first window (e.g. 'editor', 'server')"),
        startDirectory: z
          .string()
          .optional()
          .describe("Working directory for the first window"),
      }),
      execute: async (args: {
        sessionName: string;
        firstWindowName?: string;
        startDirectory?: string;
      }) => {
        const target = safeTarget(args.sessionName);
        try {
          const cmd = ["new-session", "-d", "-s", target];
          if (args.firstWindowName) {
            cmd.push("-n", safeTarget(args.firstWindowName));
          }
          if (args.startDirectory) {
            cmd.push("-c", path.resolve(args.startDirectory));
          }
          spawnSync("tmux", cmd, { encoding: "utf8", stdio: "pipe" });
          return {
            ok: true,
            sessionName: target,
            message: `Terminal session '${target}' created.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), sessionName: target };
        }
      },
    },

    terminal_kill_session: {
      description:
        "Destroy a terminal session and all its windows/panes. Use to clean up after a task completes or when the user asks to remove a session.",
      inputSchema: z.object({
        sessionName: z
          .string()
          .describe("Session name to destroy (e.g. 'coding')"),
      }),
      execute: async (args: { sessionName: string }) => {
        const session = safeTarget(args.sessionName);
        try {
          spawnSync("tmux", ["kill-session", "-t", session], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return {
            ok: true,
            sessionName: session,
            message: `Session '${session}' destroyed.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), sessionName: session };
        }
      },
    },

    terminal_rename_session: {
      description:
        "Rename a terminal session. Use when the user wants to reorganize sessions or give a session a more meaningful name.",
      inputSchema: z.object({
        oldName: z.string().describe("Current session name"),
        newName: z.string().describe("New session name"),
      }),
      execute: async (args: { oldName: string; newName: string }) => {
        const oldSession = safeTarget(args.oldName);
        const newSession = safeTarget(args.newName);
        try {
          spawnSync("tmux", ["rename-session", "-t", oldSession, newSession], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return {
            ok: true,
            oldName: oldSession,
            newName: newSession,
            message: `Session renamed from '${oldSession}' to '${newSession}'.`,
          };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            oldName: oldSession,
            newName: newSession,
          };
        }
      },
    },

    // ==================== Window management ====================

    terminal_new_window: {
      description:
        "Create a new window (tab) in an existing terminal session. Use to add Cursor Agent, Claude Code, Codex CLI, or dev server terminals. Optionally run a command in the new window.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Session name or session:window (e.g. 'coding' or 'coding:1').",
          ),
        windowName: z
          .string()
          .optional()
          .describe("Name for the new window (e.g. 'server', 'tests')"),
        command: z
          .string()
          .optional()
          .describe(
            "Command to run in the new window (e.g. 'npm run dev'). If omitted, opens a shell.",
          ),
        cwd: z.string().optional().describe("Working directory for the new window"),
      }),
      execute: async (args: {
        target: string;
        windowName?: string;
        command?: string;
        cwd?: string;
      }) => {
        const sessionPart = args.target.split(":")[0];
        const session = safeTarget(sessionPart);
        try {
          const newWinArgs = ["new-window", "-t", session, "-d"];
          if (args.windowName) {
            newWinArgs.push("-n", safeTarget(args.windowName));
          }
          if (args.cwd) {
            newWinArgs.push("-c", path.resolve(args.cwd));
          }
          spawnSync("tmux", newWinArgs, { encoding: "utf8", stdio: "pipe" });
          if (args.command) {
            spawnSync("tmux", ["send-keys", "-t", session, args.command, "Enter"], {
              encoding: "utf8",
              stdio: "pipe",
            });
          }
          return {
            ok: true,
            session,
            windowName: args.windowName ?? "(new)",
            message: `New window created in session '${session}'.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), session };
        }
      },
    },

    terminal_kill_window: {
      description:
        "Close a specific window in a terminal session. Use to clean up windows that are no longer needed.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Window target: session:window (e.g. 'coding:1' or 'coding:server')",
          ),
      }),
      execute: async (args: { target: string }) => {
        const t = safeTarget(args.target);
        try {
          spawnSync("tmux", ["kill-window", "-t", t], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return {
            ok: true,
            target: t,
            message: `Window '${t}' closed.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), target: t };
        }
      },
    },

    terminal_rename_window: {
      description:
        "Rename a window in a terminal session. Use to give a window a meaningful name (e.g. 'server', 'tests').",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Window target: session:window (e.g. 'coding:1' or 'coding:old-name')",
          ),
        newName: z.string().describe("New window name"),
      }),
      execute: async (args: { target: string; newName: string }) => {
        const t = safeTarget(args.target);
        const name = safeTarget(args.newName);
        try {
          spawnSync("tmux", ["rename-window", "-t", t, name], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return {
            ok: true,
            target: t,
            newName: name,
            message: `Window '${t}' renamed to '${name}'.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), target: t };
        }
      },
    },

    // ==================== Pane management ====================

    terminal_split_pane: {
      description:
        "Split the current pane in a terminal window (horizontal or vertical). Use to create side-by-side terminals, e.g. a dev server next to a coding window.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Target: session, session:window, or session:window.pane (e.g. 'coding:2')",
          ),
        vertical: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, split vertically (side by side); otherwise split horizontally"),
        command: z
          .string()
          .optional()
          .describe("Command to run in the new pane (e.g. 'npm run dev')"),
        cwd: z.string().optional().describe("Working directory for the new pane"),
      }),
      execute: async (args: {
        target: string;
        vertical?: boolean;
        command?: string;
        cwd?: string;
      }) => {
        const t = safeTarget(args.target);
        try {
          const splitArgs = ["split-window", "-t", t, "-d"];
          if (args.vertical) {
            splitArgs.push("-h");
          }
          if (args.cwd) {
            splitArgs.push("-c", path.resolve(args.cwd));
          }
          spawnSync("tmux", splitArgs, { encoding: "utf8", stdio: "pipe" });

          if (args.command) {
            spawnSync("tmux", ["send-keys", "-t", t, args.command, "Enter"], {
              encoding: "utf8",
              stdio: "pipe",
            });
          }
          return {
            ok: true,
            target: t,
            message: `Pane split in '${t}'.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), target: t };
        }
      },
    },

    // ==================== Input / output ====================

    terminal_send_keys: {
      description:
        "Send keys or a command to a specific terminal. Use to run a command in an existing pane or type into a specific terminal.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Target: session (e.g. 'coding'), session:window ('coding:1'), or session:window.pane ('coding:1.0')",
          ),
        keys: z
          .string()
          .describe(
            "Keys or command to send (e.g. 'npm run dev').",
          ),
        pressEnter: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true, press Enter after the keys"),
      }),
      execute: async (args: { target: string; keys: string; pressEnter?: boolean }) => {
        const t = safeTarget(args.target);
        try {
          spawnSync("tmux", ["send-keys", "-t", t, args.keys, ...(args.pressEnter !== false ? ["Enter"] : [])], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return { ok: true, target: t };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), target: t };
        }
      },
    },

    terminal_read: {
      description:
        "Read the current visible content of a terminal pane without sending any command. Ideal for monitoring long-running processes, checking build output, or reading interactive CLI state.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Target: session (e.g. 'coding'), session:window ('coding:1'), or session:window.pane ('coding:1.0')",
          ),
        lines: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .default(200)
          .describe("Number of scrollback lines to read (default: 200, max: 2000)"),
      }),
      execute: async (args: { target: string; lines?: number }) => {
        const t = safeTarget(args.target);
        const lines = args.lines ?? 200;
        try {
          const output = capturePaneOutput(t, lines);
          return {
            ok: true,
            target: t,
            lines,
            output,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), target: t };
        }
      },
    },

    // ==================== Listing & discovery ====================

    terminal_list: {
      description:
        "List terminal sessions, or list windows and panes for a session. Use when the user asks 'what terminals are running' or 'list my sessions'.",
      inputSchema: z.object({
        sessionName: z
          .string()
          .optional()
          .describe(
            "If provided, list windows and panes for this session; otherwise list all sessions",
          ),
      }),
      execute: async (args: { sessionName?: string }) => {
        try {
          if (args.sessionName) {
            const session = safeTarget(args.sessionName);
            const windows = execSync(`tmux list-windows -t '${session}' -F '#{window_index} #{window_name}' 2>/dev/null || true`, {
              encoding: "utf8",
              stdio: "pipe",
            }).trim();
            const panes = execSync(`tmux list-panes -t '${session}' -F '#{window_index}.#{pane_index} #{pane_current_command}' 2>/dev/null || true`, {
              encoding: "utf8",
              stdio: "pipe",
            }).trim();
            return {
              ok: true,
              session,
              windows: windows ? windows.split("\n") : [],
              panes: panes ? panes.split("\n") : [],
            };
          }
          const sessions = execSync("tmux list-sessions -F '#{session_name}' 2>/dev/null || true", {
            encoding: "utf8",
            stdio: "pipe",
          }).trim();
          return {
            ok: true,
            sessions: sessions ? sessions.split("\n") : [],
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    },

    // ==================== Run & capture ====================

    terminal_run: {
      description:
        "Run a shell command in a terminal session and return the output after waiting. Creates the session if it does not exist. Use for CLIs that require a TTY (e.g. Cursor agent, interactive REPLs). For reading existing output, use terminal_read instead.",
      inputSchema: z.object({
        sessionName: z
          .string()
          .describe("Terminal session name (e.g. 'build', 'agent-task')"),
        command: z
          .string()
          .describe(
            'Command to run (e.g. "npm run dev" or "agent -p \'Fix the bug\'")',
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory (defaults to process cwd)"),
        waitSeconds: z
          .number()
          .optional()
          .default(15)
          .describe("Seconds to wait before capturing output (default: 15)"),
      }),
      execute: async (args: {
        sessionName: string;
        command: string;
        cwd?: string;
        waitSeconds?: number;
      }) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? 15;
        try {
          const output = await runInSession(
            args.sessionName,
            args.command,
            cwd,
            waitSeconds,
          );
          return { ok: true, output, cwd, sessionName: args.sessionName };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            cwd,
            sessionName: args.sessionName,
          };
        }
      },
    },
  };
}

/** Exported for testing */
export const __private = {
  safeTarget,
  capturePaneOutput,
  sleep,
  isTmuxInstalled,
  detectInstallEnv,
  selectInstallCommand,
  selectAuthCommand,
  getMissingRequiredChecks,
};
