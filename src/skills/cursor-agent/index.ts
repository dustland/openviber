import { z } from "zod";
import { execSync, spawnSync } from "child_process";
import * as path from "path";

const TMUX_SESSION = "cursor-agent";

/**
 * Run Cursor CLI (agent) inside tmux so it gets a PTY.
 * Direct agent -p "..." from subprocess hangs; tmux provides a pseudo-terminal.
 */
function runInTmux(goal: string, cwd: string, waitSeconds: number): string {
  // Ensure tmux session exists (create or reuse)
  execSync(
    `tmux has-session -t ${TMUX_SESSION} 2>/dev/null || tmux new-session -d -s ${TMUX_SESSION}`,
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  // cd to cwd (quote if path has spaces)
  const cdCmd = cwd.includes(" ")
    ? `cd "${cwd.replace(/"/g, '\\"')}"`
    : `cd ${cwd}`;
  spawnSync("tmux", ["send-keys", "-t", TMUX_SESSION, cdCmd, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Send agent -p 'goal' (spawn avoids shell escaping of goal)
  const sendArg = `agent -p ${JSON.stringify(goal)}`;
  spawnSync("tmux", ["send-keys", "-t", TMUX_SESSION, sendArg, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Workspace trust: after a few seconds send "a" to accept (first run only; harmless if not prompted)
  execSync("sleep 3", { encoding: "utf8", stdio: "pipe" });
  spawnSync("tmux", ["send-keys", "-t", TMUX_SESSION, "a"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Wait for completion
  execSync(`sleep ${Math.max(10, waitSeconds)}`, {
    encoding: "utf8",
    stdio: "pipe",
  });

  const out = execSync(`tmux capture-pane -t ${TMUX_SESSION} -p -S -200`, {
    encoding: "utf8",
    stdio: "pipe",
  });
  return out;
}

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    cursor_agent_run: {
      description:
        "Run the Cursor CLI (agent) with the given prompt. Call this whenever the user says 'use cursor-agent', 'cursor agent', 'run the Cursor CLI', or asks to delegate a coding task to Cursor—pass their task as the goal. Runs in tmux (TTY required). Requires tmux and Cursor CLI installed.",
      inputSchema: z.object({
        goal: z
          .string()
          .describe(
            "The task or prompt to send to the Cursor agent (e.g. 'Refactor this file to use async/await')",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory for the agent (defaults to current process cwd)",
          ),
        waitSeconds: z
          .number()
          .optional()
          .default(45)
          .describe(
            "Seconds to wait before capturing output (agent may still be running)",
          ),
      }),
      execute: async (args: {
        goal: string;
        cwd?: string;
        waitSeconds?: number;
      }) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? 45;
        try {
          const output = runInTmux(args.goal, cwd, waitSeconds);
          return { ok: true, output, cwd };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), cwd };
        }
      },
    },
  };
}
