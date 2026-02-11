import { z } from "zod";
import { execSync, spawnSync } from "child_process";
import * as path from "path";

const SAFE_RE = /[^a-zA-Z0-9_.:-]/g;

/**
 * Sanitize a tmux target string to prevent shell injection.
 */
function safeTarget(t: string): string {
  return t.replace(SAFE_RE, "-");
}

/**
 * Sleep for a given number of seconds using a non-blocking timer.
 */
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, seconds) * 1000));
}

/**
 * Capture the current contents of a tmux pane.
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
 * Run a command inside a tmux session and capture pane output.
 * Use for CLIs that require a TTY (e.g. Cursor agent, interactive REPLs).
 */
async function runInTmux(
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
    // ==================== Discovery & health ====================

    tmux_install_check: {
      description:
        "Check if tmux is installed and return its version. Call before using any tmux_* tool. If not installed, tell the user how to install it.",
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

    // ==================== Session management ====================

    tmux_new_session: {
      description:
        "Create a new detached tmux session. Use when the user asks to set up a coding session or workspace. Optionally set the first window name and/or start directory.",
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
          spawnSync("tmux", cmd, { encoding: "utf8", stdio: "pipe" });
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

    tmux_kill_session: {
      description:
        "Kill (destroy) a tmux session and all its windows/panes. Use to clean up after a task completes or when the user asks to remove a session.",
      inputSchema: z.object({
        sessionName: z
          .string()
          .describe("Session name to kill (e.g. 'coding')"),
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
            message: `Session '${session}' killed.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), sessionName: session };
        }
      },
    },

    tmux_rename_session: {
      description:
        "Rename an existing tmux session. Use when the user wants to reorganize sessions or give a session a more meaningful name.",
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

    tmux_kill_window: {
      description:
        "Kill (close) a specific window in a tmux session. Use to clean up windows that are no longer needed.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Window target: session:window (e.g. 'coding:1' or 'coding:cursor-1')",
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
            message: `Window '${t}' killed.`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), target: t };
        }
      },
    },

    tmux_rename_window: {
      description:
        "Rename a window in a tmux session. Use to give a window a meaningful name (e.g. 'dev-server', 'cursor-3').",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Window target: session:window (e.g. 'coding:1' or 'coding:old-name')",
          ),
        newName: z.string().describe("New window name (e.g. 'cursor-3')"),
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

    // ==================== Input / output ====================

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

    tmux_capture_pane: {
      description:
        "Capture and return the current visible content of a tmux pane. Use to read what is currently displayed in a terminal without sending any command — ideal for monitoring long-running processes, checking build output, or reading interactive CLI state.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Tmux target: session (e.g. 'coding'), session:window ('coding:1'), or session:window.pane ('coding:1.0')",
          ),
        lines: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .default(200)
          .describe("Number of scrollback lines to capture (default: 200, max: 2000)"),
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

    tmux_run: {
      description:
        "Run a shell command inside a tmux session and return the pane output after waiting. Use for CLIs that require a TTY (e.g. Cursor agent, interactive REPLs). Creates the session if it does not exist. For reading existing output without sending a command, use tmux_capture_pane instead.",
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
          const output = await runInTmux(
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
export const __private = { safeTarget, capturePaneOutput, sleep };
