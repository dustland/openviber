import { z } from "zod";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const MAX_CAPTURE_CHARS = 12000;
const MIN_WAIT_SECONDS = 10;
const DEFAULT_WAIT_SECONDS = 90;
const DEFAULT_TAIL_LINES = 80;

/**
 * codex_run compatibility modes.
 * These keep the existing skill API stable while mapping to current Codex CLI flags.
 */
type ApprovalMode = "full-auto" | "auto-edit" | "suggest";

type CodexRunResult = {
  ok: boolean;
  cwd: string;
  approvalMode: ApprovalMode;
  model?: string;
  command?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  output: string;
  stdoutTail: string;
  stderrTail: string;
  stderr?: string;
  error?: string;
  summary: string;
};

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
 * Convert full output into a short line-based tail for web chat readability.
 */
function getTailLines(raw: string, maxLines = DEFAULT_TAIL_LINES): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length <= maxLines) {
    return lines.join("\n");
  }

  const tail = lines.slice(-maxLines);
  const hidden = lines.length - tail.length;
  return `...[${hidden} earlier lines omitted]...\n${tail.join("\n")}`;
}

/**
 * Ensure the cwd exists and is a directory.
 */
function resolveWorkingDirectory(rawCwd?: string): string {
  const cwd = rawCwd ? path.resolve(rawCwd) : process.cwd();
  if (!fs.existsSync(cwd)) {
    throw new Error(`cwd does not exist: ${cwd}`);
  }
  if (!fs.statSync(cwd).isDirectory()) {
    throw new Error(`cwd is not a directory: ${cwd}`);
  }
  return cwd;
}

/**
 * Ensure the codex binary is available before attempting to spawn.
 */
function ensureCodexInstalled(): void {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const unixCandidate = path.join(entry, "codex");
    if (fs.existsSync(unixCandidate)) {
      return;
    }

    const winCandidate = path.join(entry, "codex.cmd");
    if (fs.existsSync(winCandidate)) {
      return;
    }
  }

  throw new Error(
    "Codex CLI not found in PATH. Install with `pnpm add -g @openai/codex` and run `codex login`.",
  );
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
    }, Math.max(MIN_WAIT_SECONDS, waitSeconds) * 1000);

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

/**
 * Build a chat-friendly tool result with both full output and compact tails.
 */
function formatResult(
  args: {
    cwd: string;
    approvalMode: ApprovalMode;
    model?: string;
    command?: string;
    result?: Awaited<ReturnType<typeof runCodexExec>>;
    error?: string;
  },
): CodexRunResult {
  const stdout = args.result?.stdout?.trim() || "";
  const stderr = args.result?.stderr?.trim() || "";
  const merged = truncateOutput([stdout, stderr].filter(Boolean).join("\n\n"));

  const timedOut = args.result?.timedOut ?? false;
  const exitCode = args.result?.exitCode;

  const status =
    args.error
      ? "failed"
      : timedOut
        ? "timed_out"
        : exitCode === 0
          ? "success"
          : "failed";

  const summaryParts = [
    `status=${status}`,
    `cwd=${args.cwd}`,
    `approvalMode=${args.approvalMode}`,
    args.model ? `model=${args.model}` : "model=default",
    args.result ? `exitCode=${String(exitCode ?? "unknown")}` : "exitCode=not-run",
  ];

  return {
    ok: status === "success",
    cwd: args.cwd,
    approvalMode: args.approvalMode,
    model: args.model,
    command: args.command,
    exitCode,
    timedOut,
    output: merged,
    stdoutTail: getTailLines(stdout),
    stderrTail: getTailLines(stderr),
    stderr,
    error: args.error,
    summary: summaryParts.join(" | "),
  };
}

export function getTools(): Record<string, import("../worker/tool").CoreTool> {
  return {
    codex_run: {
      description:
        "Run the OpenAI Codex CLI with a prompt for autonomous coding. Optimized for web chat: always returns a compact summary plus stdout/stderr tails for easy follow-up. Call when the user says 'use codex', 'run codex', or asks to delegate coding to Codex.",
      inputSchema: z.object({
        prompt: z
          .string()
          .min(4)
          .describe(
            "The coding task or prompt (e.g. 'Fix the failing test in utils.test.ts').",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory where Codex will operate (defaults to process cwd). Must exist.",
          ),
        waitSeconds: z
          .number()
          .int()
          .min(MIN_WAIT_SECONDS)
          .max(1800)
          .optional()
          .default(DEFAULT_WAIT_SECONDS)
          .describe(
            "Maximum seconds to allow Codex execution before timeout (default: 90, min: 10).",
          ),
        approvalMode: z
          .enum(["full-auto", "auto-edit", "suggest"])
          .optional()
          .default("full-auto")
          .describe(
            "Execution mode: full-auto (--full-auto), auto-edit (workspace-write), suggest (read-only).",
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
        const approvalMode = args.approvalMode ?? "full-auto";
        const waitSeconds = args.waitSeconds ?? DEFAULT_WAIT_SECONDS;

        try {
          ensureCodexInstalled();
          const cwd = resolveWorkingDirectory(args.cwd);
          const result = await runCodexExec(
            args.prompt,
            cwd,
            waitSeconds,
            approvalMode,
            args.model,
          );

          if (result.timedOut) {
            return formatResult({
              cwd,
              approvalMode,
              model: args.model,
              command: result.command,
              result,
              error: `codex execution timed out after ${Math.max(MIN_WAIT_SECONDS, waitSeconds)}s`,
            });
          }

          if (result.exitCode !== 0) {
            return formatResult({
              cwd,
              approvalMode,
              model: args.model,
              command: result.command,
              result,
              error: `codex exited with code ${result.exitCode ?? "unknown"}`,
            });
          }

          return formatResult({
            cwd,
            approvalMode,
            model: args.model,
            command: result.command,
            result,
          });
        } catch (err: any) {
          const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
          return formatResult({
            cwd,
            approvalMode,
            model: args.model,
            error: err?.message || String(err),
          });
        }
      },
    },
  };
}

export const __private = {
  buildCodexArgs,
  truncateOutput,
  getTailLines,
  resolveWorkingDirectory,
};
