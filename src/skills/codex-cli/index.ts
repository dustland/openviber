import { z } from "zod";
import { spawn } from "child_process";
import * as path from "path";

const MAX_CAPTURE_CHARS = 12000;

/**
 * codex_run compatibility modes.
 * These keep the existing skill API stable while mapping to current Codex CLI flags.
 */
type ApprovalMode = "full-auto" | "auto-edit" | "suggest";

/**
 * Limit output size so tool results do not explode token usage.
 */
function truncateOutput(raw: string): string {
  if (raw.length <= MAX_CAPTURE_CHARS) {
    return raw;
  }
  const head = raw.slice(0, Math.floor(MAX_CAPTURE_CHARS / 2));
  const tail = raw.slice(-Math.floor(MAX_CAPTURE_CHARS / 2));
  const hidden = raw.length - head.length - tail.length;
  return `${head}\n...[truncated ${hidden} chars]...\n${tail}`;
}

/**
 * Build `codex exec` arguments from skill parameters.
 */
function buildCodexArgs(
  prompt: string,
  cwd: string,
  approvalMode: ApprovalMode,
  model?: string,
): string[] {
  const args = ["exec"];

  switch (approvalMode) {
    case "full-auto":
      // Low-friction autonomous mode with writable workspace.
      args.push("--full-auto");
      break;
    case "auto-edit":
      // Writable workspace without forcing full-auto behavior.
      args.push("-s", "workspace-write");
      break;
    case "suggest":
      // Read-only execution for suggestion-only workflows.
      args.push("-s", "read-only");
      break;
  }

  args.push("--skip-git-repo-check", "--cd", cwd, "--color", "never");

  if (model) {
    args.push("--model", model);
  }

  args.push(prompt);
  return args;
}

/**
 * Run Codex CLI non-interactively and capture stdout/stderr.
 */
async function runCodexExec(
  prompt: string,
  cwd: string,
  waitSeconds: number,
  approvalMode: ApprovalMode,
  model?: string,
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  command: string;
}> {
  const args = buildCodexArgs(prompt, cwd, approvalMode, model);
  const command = `codex ${args.map((a) => JSON.stringify(a)).join(" ")}`;

  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 3_000);
    }, Math.max(10, waitSeconds) * 1000);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        command,
      });
    });
  });
}

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    codex_run: {
      description:
        "Run the OpenAI Codex CLI with a prompt for autonomous coding. Call when the user says 'use codex', 'run codex', or when delegating a coding task to Codex. Uses `codex exec` (non-interactive) so it works reliably from Node/AI SDK tool calls.",
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
            "Maximum seconds to allow codex execution before timing out (default: 60).",
          ),
        approvalMode: z
          .enum(["full-auto", "auto-edit", "suggest"])
          .optional()
          .default("full-auto")
          .describe(
            "Execution mode: full-auto (Codex --full-auto), auto-edit (workspace-write sandbox), suggest (read-only suggestions).",
          ),
        model: z
          .string()
          .optional()
          .describe(
            "Optional Codex model override (e.g. 'gpt-5-codex'). Uses Codex CLI default if omitted.",
          ),
      }),
      execute: async (args: {
        prompt: string;
        cwd?: string;
        waitSeconds?: number;
        approvalMode?: ApprovalMode;
        model?: string;
      }) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? 60;
        const approvalMode = args.approvalMode ?? "full-auto";
        try {
          const result = await runCodexExec(
            args.prompt,
            cwd,
            waitSeconds,
            approvalMode,
            args.model,
          );

          const output = truncateOutput(
            [result.stdout, result.stderr]
              .filter((x) => x && x.trim().length > 0)
              .join("\n")
              .trim(),
          );

          if (result.timedOut) {
            return {
              ok: false,
              error: `codex execution timed out after ${Math.max(10, waitSeconds)}s`,
              output,
              cwd,
              approvalMode,
              model: args.model,
              exitCode: result.exitCode,
              command: result.command,
            };
          }

          if (result.exitCode !== 0) {
            return {
              ok: false,
              error: `codex exited with code ${result.exitCode ?? "unknown"}`,
              output,
              cwd,
              approvalMode,
              model: args.model,
              exitCode: result.exitCode,
              command: result.command,
            };
          }

          return {
            ok: true,
            output,
            cwd,
            approvalMode,
            model: args.model,
            exitCode: result.exitCode,
            command: result.command,
          };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            cwd,
            approvalMode,
            model: args.model,
          };
        }
      },
    },
  };
}

export const __private = {
  buildCodexArgs,
  truncateOutput,
};
