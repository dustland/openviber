import { z } from "zod";
import { execSync, spawnSync } from "child_process";
import * as path from "path";

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
  const safeSession = sessionName.replace(/[^a-zA-Z0-9_-]/g, "-");
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

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
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
    tmux_install_check: {
      description:
        "Check if tmux is installed and return its version. Call when the user says 'use tmux' or before using tmux_run/cursor_agent_run; if not installed, tell the user to install (e.g. brew install tmux on macOS).",
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
  };
}
