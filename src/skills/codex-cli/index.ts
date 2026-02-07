import { z } from "zod";
import { execSync, spawnSync } from "child_process";
import * as path from "path";

const TMUX_SESSION = "codex-cli";

/**
 * Run Codex CLI inside tmux so it gets a PTY.
 * Direct `codex` from subprocess hangs; tmux provides a pseudo-terminal.
 */
function runInTmux(
  prompt: string,
  cwd: string,
  waitSeconds: number,
  approvalMode: string,
): string {
  // Ensure tmux session exists (create or reuse)
  execSync(
    `tmux has-session -t ${TMUX_SESSION} 2>/dev/null || tmux new-session -d -s ${TMUX_SESSION}`,
    { encoding: "utf8", stdio: "pipe" },
  );

  // cd to cwd
  const cdCmd = cwd.includes(" ")
    ? `cd "${cwd.replace(/"/g, '\\"')}"`
    : `cd ${cwd}`;
  spawnSync("tmux", ["send-keys", "-t", TMUX_SESSION, cdCmd, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Build codex command
  // codex --approval-mode full-auto -q "prompt"
  const codexCmd = `codex --approval-mode ${approvalMode} -q ${JSON.stringify(prompt)}`;
  spawnSync("tmux", ["send-keys", "-t", TMUX_SESSION, codexCmd, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Wait for Codex to work
  execSync(`sleep ${Math.max(10, waitSeconds)}`, {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Capture output
  const out = execSync(`tmux capture-pane -t ${TMUX_SESSION} -p -S -300`, {
    encoding: "utf8",
    stdio: "pipe",
  });
  return out;
}

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    codex_run: {
      description:
        "Run the OpenAI Codex CLI with a prompt for autonomous coding. Call when the user says 'use codex', 'run codex', or when delegating a coding task to Codex. Runs inside tmux (PTY required). Requires tmux and Codex CLI installed. Codex will read/write files in the given cwd.",
      inputSchema: z.object({
        prompt: z
          .string()
          .describe(
            "The coding task or prompt (e.g. 'Fix the failing test in utils.test.ts')",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory where Codex will operate (defaults to process cwd)",
          ),
        waitSeconds: z
          .number()
          .optional()
          .default(60)
          .describe(
            "Seconds to wait before capturing output (default: 60). Codex may still be running.",
          ),
        approvalMode: z
          .enum(["full-auto", "auto-edit", "suggest"])
          .optional()
          .default("full-auto")
          .describe(
            "Codex approval mode: full-auto (default, no prompts), auto-edit (auto-approve edits), suggest (suggest only)",
          ),
      }),
      execute: async (args: {
        prompt: string;
        cwd?: string;
        waitSeconds?: number;
        approvalMode?: "full-auto" | "auto-edit" | "suggest";
      }) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? 60;
        const approvalMode = args.approvalMode ?? "full-auto";
        try {
          const output = runInTmux(args.prompt, cwd, waitSeconds, approvalMode);
          return { ok: true, output, cwd, approvalMode };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), cwd };
        }
      },
    },
  };
}
