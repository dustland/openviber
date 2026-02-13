import { z } from "zod";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const MAX_CAPTURE_CHARS = 12000;
const MIN_WAIT_SECONDS = 10;
const DEFAULT_WAIT_SECONDS = 120;
const DEFAULT_TAIL_LINES = 80;

/**
 * gemini_run approval modes.
 */
type ApprovalMode = "yolo" | "default";

type GeminiRunResult = {
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
 * Ensure the gemini binary is available before attempting to spawn.
 */
function ensureGeminiInstalled(): void {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, "gemini");
    if (fs.existsSync(candidate)) {
      return;
    }
    const winCandidate = path.join(entry, "gemini.cmd");
    if (fs.existsSync(winCandidate)) {
      return;
    }
  }

  throw new Error(
    "Gemini CLI not found in PATH. Install with `npm install -g @google/gemini-cli` and authenticate with `gemini` or set GEMINI_API_KEY.",
  );
}

/**
 * Build `gemini` arguments from skill parameters.
 */
function buildGeminiArgs(
  prompt: string,
  approvalMode: ApprovalMode,
  model?: string,
  outputFormat?: string,
): string[] {
  const args: string[] = [];

  // Headless mode via --prompt
  args.push("--prompt", prompt);

  // Approval mode
  if (approvalMode === "yolo") {
    args.push("--yolo");
  }

  // Model override
  if (model) {
    args.push("--model", model);
  }

  // Output format
  if (outputFormat && outputFormat !== "text") {
    args.push("--output-format", outputFormat);
  }

  return args;
}

/**
 * Run Gemini CLI in headless mode and capture stdout/stderr.
 */
async function runGemini(
  prompt: string,
  cwd: string,
  waitSeconds: number,
  approvalMode: ApprovalMode,
  model?: string,
  outputFormat?: string,
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  command: string;
}> {
  const args = buildGeminiArgs(prompt, approvalMode, model, outputFormat);
  const command = `gemini ${args.map((a) => JSON.stringify(a)).join(" ")}`;

  return new Promise((resolve, reject) => {
    const child = spawn("gemini", args, {
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
    result?: Awaited<ReturnType<typeof runGemini>>;
    error?: string;
  },
): GeminiRunResult {
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

export function getTools(): Record<string, import("../../viber/tool").CoreTool> {
  return {
    gemini_run: {
      description:
        "Run the Google Gemini CLI with a prompt for autonomous coding or general tasks. Uses headless mode for automation. Always returns a compact summary plus stdout/stderr tails for easy follow-up. Call when the user says 'use gemini', 'run gemini cli', or asks to delegate a task to Gemini.",
      inputSchema: z.object({
        prompt: z
          .string()
          .min(4)
          .describe(
            "The task or prompt (e.g. 'Fix the failing test in utils.test.ts').",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory where Gemini will operate (defaults to process cwd). Must exist.",
          ),
        waitSeconds: z
          .number()
          .int()
          .min(MIN_WAIT_SECONDS)
          .max(1800)
          .optional()
          .default(DEFAULT_WAIT_SECONDS)
          .describe(
            "Maximum seconds to allow Gemini execution before timeout (default: 120, min: 10).",
          ),
        approvalMode: z
          .enum(["yolo", "default"])
          .optional()
          .default("yolo")
          .describe(
            "Execution mode: yolo (--yolo, auto-approve all actions), default (normal mode).",
          ),
        model: z
          .string()
          .optional()
          .describe(
            "Optional Gemini model override (e.g. 'gemini-2.5-pro', 'gemini-2.5-flash'). Uses Gemini CLI default if omitted.",
          ),
        outputFormat: z
          .enum(["text", "json"])
          .optional()
          .default("text")
          .describe(
            "Output format: text (default human-readable) or json (structured).",
          ),
      }),
      execute: async (args: {
        prompt: string;
        cwd?: string;
        waitSeconds?: number;
        approvalMode?: ApprovalMode;
        model?: string;
        outputFormat?: "text" | "json";
      }, context?: any) => {
        const approvalMode = args.approvalMode ?? "yolo";
        const waitSeconds = args.waitSeconds ?? DEFAULT_WAIT_SECONDS;

        try {
          // If web-stored Google OAuth tokens are available, sync them to
          // ~/.gemini/ so the CLI subprocess picks them up automatically.
          const googleTokens = context?.oauthTokens?.google;
          if (googleTokens?.accessToken) {
            const { syncGeminiCredentials } = await import("./gemini-auth");
            syncGeminiCredentials({
              accessToken: googleTokens.accessToken,
              refreshToken: googleTokens.refreshToken,
            });
          }

          ensureGeminiInstalled();
          const cwd = resolveWorkingDirectory(args.cwd);
          const result = await runGemini(
            args.prompt,
            cwd,
            waitSeconds,
            approvalMode,
            args.model,
            args.outputFormat,
          );

          if (result.timedOut) {
            return formatResult({
              cwd,
              approvalMode,
              model: args.model,
              command: result.command,
              result,
              error: `gemini execution timed out after ${Math.max(MIN_WAIT_SECONDS, waitSeconds)}s`,
            });
          }

          if (result.exitCode !== 0) {
            return formatResult({
              cwd,
              approvalMode,
              model: args.model,
              command: result.command,
              result,
              error: `gemini exited with code ${result.exitCode ?? "unknown"}`,
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
  buildGeminiArgs,
  truncateOutput,
  getTailLines,
  resolveWorkingDirectory,
};
