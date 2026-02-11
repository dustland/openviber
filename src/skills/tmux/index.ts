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
  "tmux",
] as const;

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

const DEFAULT_SETUP_SESSION = "skill-setup";
const DEFAULT_SETUP_WAIT_SECONDS = 120;
const MIN_SETUP_WAIT_SECONDS = 10;
const MAX_SETUP_WAIT_SECONDS = 900;
const SETUP_POLL_INTERVAL_MS = 3000;

function safeTarget(t: string): string {
  return t.replace(SAFE_RE, "-");
}

/**
 * Run a command inside a tmux session and capture pane output.
 * Use for CLIs that require a TTY (e.g. Cursor agent, interactive REPLs).
 */
function runInTmux(
  sessionName: string,
  command: string,
  cwd: string,
  waitSeconds: number,
): string {
  const safeSession = sessionName.replace(SAFE_RE, "-");
  execSync(
    `tmux has-session -t ${safeSession} 2>/dev/null || tmux new-session -d -s ${safeSession}`,
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

  execSync(`sleep ${Math.max(1, waitSeconds)}`, {
    encoding: "utf8",
    stdio: "pipe",
  });

  const out = execSync(`tmux capture-pane -t ${safeSession} -p -S -200`, {
    encoding: "utf8",
    stdio: "pipe",
  });
  return out;
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
      const cursorCmd = resolveCommand(["agent", "cursor-agent"]);
      return cursorCmd ? `${cursorCmd} login` : null;
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

function trimOutput(raw: string, maxChars: number = 4000): string {
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
  timeoutMs: number = 300_000,
): { ok: boolean; stdout: string; stderr: string; error?: string } {
  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      stdio: "pipe",
      cwd,
      timeout: timeoutMs,
    });
    return {
      ok: true,
      stdout: trimOutput(stdout),
      stderr: "",
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: trimOutput(err?.stdout ? String(err.stdout) : ""),
      stderr: trimOutput(err?.stderr ? String(err.stderr) : ""),
      error: err?.message || String(err),
    };
  }
}

function startAuthFlowInTmux(args: {
  sessionName: string;
  command: string;
  cwd: string;
}): { sessionName: string; target: string } {
  const sessionName = safeTarget(args.sessionName);
  execSync(
    `tmux has-session -t ${sessionName} 2>/dev/null || tmux new-session -d -s ${sessionName}`,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCheckToPass(args: {
  skillId: SkillSetupId;
  checkId: string;
  waitSeconds: number;
}): Promise<{ passed: boolean; latest: SkillHealthResult }> {
  const timeoutMs = Math.max(MIN_SETUP_WAIT_SECONDS, args.waitSeconds) * 1000;
  const startedAt = Date.now();
  let latest = await checkSkillHealth({ id: args.skillId });

  while (Date.now() - startedAt < timeoutMs) {
    const check = latest.checks.find((item) => item.id === args.checkId);
    if (check?.ok) {
      return { passed: true, latest };
    }
    await sleep(SETUP_POLL_INTERVAL_MS);
    latest = await checkSkillHealth({ id: args.skillId });
  }

  return { passed: false, latest };
}

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    tmux_install_check: {
      description:
        "Check if tmux is installed and return its version. Call when the user says 'use tmux' or before using any tmux_* tool; if not installed, tell the user to install (e.g. brew install tmux on macOS).",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const out = execSync("tmux -V", {
            encoding: "utf8",
            stdio: "pipe",
          });
          return { installed: true, version: out.trim() };
        } catch {
          return {
            installed: false,
            hint: "Install with: brew install tmux (macOS) or sudo apt install tmux (Ubuntu)",
          };
        }
      },
    },
    tmux_prepare_skill_prerequisites: {
      description:
        "Prepare prerequisites for a built-in skill using terminal automation. Use mode='plan' to preview actions, then mode='apply' to install missing CLIs and run interactive login flows inside tmux.",
      inputSchema: z.object({
        skillId: z
          .enum(SKILL_SETUP_IDS)
          .describe("Skill to prepare (cursor-agent, codex-cli, gemini-cli, github, railway, tmux)."),
        mode: z
          .enum(["plan", "apply"])
          .optional()
          .default("plan")
          .describe("plan: preview actions only; apply: execute install/auth actions."),
        runAuthFlow: z
          .boolean()
          .optional()
          .default(true)
          .describe("When true, start interactive auth commands (e.g. gh auth login) in tmux."),
        sessionName: z
          .string()
          .optional()
          .default(DEFAULT_SETUP_SESSION)
          .describe("Tmux session name to use for interactive auth flows."),
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

        const before = await checkSkillHealth({ id: args.skillId });
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
            latest = await checkSkillHealth({ id: args.skillId });
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
                message: "Interactive auth will be launched in a tmux session in apply mode.",
              });
              continue;
            }

            try {
              const authFlow = startAuthFlowInTmux({
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
                  ? `Authentication completed via tmux session '${authFlow.sessionName}'.`
                  : `Authentication still pending. Continue in tmux target '${authFlow.target}'.`,
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
                ? "Setup is partially complete. User input is still required in tmux."
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
                  "Use tmux_attach/tmux_send_keys (or local terminal attach) to complete interactive login.",
              }
            : {}),
          summary,
        };
      },
    },
    tmux_new_session: {
      description:
        "Create a new detached tmux session. Use when the user asks to set up a coding session or create a new tmux session. Optionally set the first window name and/or start directory.",
      inputSchema: z.object({
        sessionName: z.string().describe("Session name (e.g. 'coding')"),
        firstWindowName: z
          .string()
          .optional()
          .describe("Name for the first window (e.g. 'cursor-1')"),
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
          execSync(`tmux ${cmd.map((c) => `'${c}'`).join(" ")}`, {
            encoding: "utf8",
            stdio: "pipe",
          });
          return {
            ok: true,
            sessionName: target,
            message: `Session '${target}' created. Attach with: tmux attach -t ${target}`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), sessionName: target };
        }
      },
    },
    tmux_new_window: {
      description:
        "Create a new window in an existing tmux session. Use to add Cursor Agent, Claude Code, Codex CLI, or dev server terminals. Optionally set window name and command to run.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Session name or session:window (e.g. 'coding' or 'coding:1'). New window is created in the session.",
          ),
        windowName: z
          .string()
          .optional()
          .describe("Name for the new window (e.g. 'cursor-2', 'codex-a')"),
        command: z
          .string()
          .optional()
          .describe(
            "Command to run in the new window (e.g. 'agent' or 'cd /path && npm run dev'). If omitted, just opens a shell.",
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
            message: `New window created in session '${session}'. Attach with: tmux attach -t ${session}`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), session };
        }
      },
    },
    tmux_split_pane: {
      description:
        "Split the current pane in a tmux window (horizontal or vertical). Use to add a dev server pane next to a Cursor window, or to run a command in a new pane.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Session, session:window, or session:window.pane (e.g. 'coding:2' or 'coding:cursor-1')",
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
            message: `Pane split in '${t}'. Attach with: tmux attach -t ${t.split(":")[0]}`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), target: t };
        }
      },
    },
    tmux_send_keys: {
      description:
        "Send keys (or a command) to a specific tmux target: session, session:window, or session:window.pane. Use to run a command in an existing pane or to type into a specific terminal.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Tmux target: session (e.g. 'coding'), session:window ('coding:1' or 'coding:cursor-1'), or session:window.pane ('coding:1.0')",
          ),
        keys: z
          .string()
          .describe(
            "Keys or command to send (e.g. 'npm run dev' or 'agent -p \"task\"'). Use 'Enter' for newline.",
          ),
        pressEnter: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true, send Enter after the keys"),
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
    tmux_list: {
      description:
        "List tmux sessions, or list windows and panes for a session. Use when the user asks 'what is my tmux layout' or 'list my terminals' so you can describe the layout or choose where to open the next window.",
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
            const windows = execSync(`tmux list-windows -t ${session} -F '#{window_index} #{window_name}' 2>/dev/null || true`, {
              encoding: "utf8",
              stdio: "pipe",
            }).trim();
            const panes = execSync(`tmux list-panes -t ${session} -F '#{window_index}.#{pane_index} #{pane_current_command}' 2>/dev/null || true`, {
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
    tmux_run: {
      description:
        "Run a shell command inside a tmux session and return the pane output. Call when the user says 'use tmux' or asks to run a command in a terminal/tmux. Use for CLIs that require a TTY. Requires tmux installed (use tmux_install_check first).",
      inputSchema: z.object({
        sessionName: z
          .string()
          .describe("Tmux session name (e.g. 'cursor-agent' or 'mytask')"),
        command: z
          .string()
          .describe(
            'Full command to run (e.g. "agent -p \'Refactor this file\'" or "npm run dev")',
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory (defaults to process cwd)"),
        waitSeconds: z
          .number()
          .optional()
          .default(15)
          .describe("Seconds to wait before capturing output"),
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
          const output = runInTmux(
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

export const __private = {
  detectInstallEnv,
  selectInstallCommand,
  selectAuthCommand,
  getMissingRequiredChecks,
};
