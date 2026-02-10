import { z } from "zod";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { CoreTool } from "../../core/tool";

const MAX_CAPTURE_CHARS = 12000;
const DEFAULT_TAIL_LINES = 80;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_RESULTS = 200;

type GogCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  command: string;
};

type GogToolResult = {
  ok: boolean;
  command: string;
  output: string;
  stdoutTail: string;
  stderrTail: string;
  exitCode?: number | null;
  timedOut?: boolean;
  error?: string;
  summary: string;
};

function truncateOutput(raw: string): string {
  if (raw.length <= MAX_CAPTURE_CHARS) return raw;
  const head = raw.slice(0, Math.floor(MAX_CAPTURE_CHARS / 2));
  const tail = raw.slice(-Math.floor(MAX_CAPTURE_CHARS / 2));
  const hidden = raw.length - head.length - tail.length;
  return `${head}\n...[truncated ${hidden} chars]...\n${tail}`;
}

function getTailLines(raw: string, maxLines = DEFAULT_TAIL_LINES): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length <= maxLines) return lines.join("\n");
  const tail = lines.slice(-maxLines);
  return `...[${lines.length - tail.length} earlier lines omitted]...\n${tail.join("\n")}`;
}

function ensureGogInstalled(): void {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    if (fs.existsSync(path.join(entry, "gog"))) return;
    if (fs.existsSync(path.join(entry, "gog.exe"))) return;
    if (fs.existsSync(path.join(entry, "gog.cmd"))) return;
    if (fs.existsSync(path.join(entry, "gog.bat"))) return;
  }
  throw new Error(
    "gog CLI not found in PATH. Install with `brew install steipete/tap/gogcli` or build from https://github.com/steipete/gogcli, then run `gog auth add`.",
  );
}

async function runGog(
  args: string[],
  timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS,
): Promise<GogCommandResult> {
  const command = `gog ${args.map((a) => JSON.stringify(a)).join(" ")}`;
  return new Promise((resolve, reject) => {
    execFile(
      "gog",
      args,
      {
        timeout: timeoutSeconds * 1000,
        maxBuffer: 5 * 1024 * 1024,
        env: process.env,
      },
      (error, stdout, stderr) => {
        const timedOut = Boolean(error && (error as any).killed);
        const exitCode = error ? (error as any).code ?? 1 : 0;
        resolve({
          exitCode: typeof exitCode === "number" ? exitCode : 1,
          stdout: stdout || "",
          stderr: stderr || "",
          timedOut,
          command,
        });
      },
    );
  });
}

function formatResult(args: {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}): GogToolResult {
  const merged = truncateOutput(
    [args.stdout.trim(), args.stderr.trim()].filter(Boolean).join("\n\n"),
  );
  const status = args.error
    ? "failed"
    : args.timedOut
      ? "timed_out"
      : args.exitCode === 0
        ? "success"
        : "failed";

  return {
    ok: status === "success",
    command: args.command,
    output: merged,
    stdoutTail: getTailLines(args.stdout),
    stderrTail: getTailLines(args.stderr),
    exitCode: args.exitCode,
    timedOut: args.timedOut,
    error: args.error,
    summary: `status=${status} | exitCode=${args.exitCode ?? "unknown"}`,
  };
}

function parseJsonOutput(stdout: string): { ok: true; data: any } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(stdout) };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function getTools(): Record<string, CoreTool> {
  return {
    gog_gmail_search: {
      description:
        "Search Gmail threads using gog CLI. Returns JSON threads from `gog gmail search --json --no-input`.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Gmail search query (e.g. 'is:unread newer_than:7d')"),
        max: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .optional()
          .default(20)
          .describe("Maximum number of threads to return (default: 20)"),
        account: z
          .string()
          .optional()
          .describe("Gmail account or alias to use (defaults to GOG_ACCOUNT)"),
        timeoutSeconds: z
          .number()
          .int()
          .min(5)
          .max(120)
          .optional()
          .default(DEFAULT_TIMEOUT_SECONDS)
          .describe("Timeout for the gog command (default: 30s)"),
      }),
      execute: async (args: {
        query: string;
        max?: number;
        account?: string;
        timeoutSeconds?: number;
      }) => {
        try {
          ensureGogInstalled();
          const cmdArgs = [
            "gmail",
            "search",
            args.query,
            "--max",
            String(args.max ?? 20),
            "--json",
            "--no-input",
          ];
          if (args.account) {
            cmdArgs.push("--account", args.account);
          }

          const result = await runGog(cmdArgs, args.timeoutSeconds);
          if (result.timedOut) {
            return formatResult({
              ...result,
              error: `gog gmail search timed out after ${args.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS}s`,
            });
          }
          if (result.exitCode !== 0) {
            return formatResult({
              ...result,
              error: `gog exited with code ${result.exitCode ?? "unknown"}`,
            });
          }

          const parsed = parseJsonOutput(result.stdout.trim());
          if (!parsed.ok) {
            return formatResult({
              ...result,
              error: `Failed to parse gog JSON output: ${parsed.error}`,
            });
          }

          const threads = Array.isArray(parsed.data?.threads)
            ? parsed.data.threads
            : [];
          const base = formatResult(result);
          return {
            ...base,
            count: threads.length,
            threads,
            data: parsed.data,
            summary: `Found ${threads.length} thread(s) for "${args.query}"`,
          };
        } catch (err: any) {
          return formatResult({
            command: "gog gmail search",
            stdout: "",
            stderr: "",
            exitCode: null,
            timedOut: false,
            error: err?.message || String(err),
          });
        }
      },
    },

    gog_gmail_messages_search: {
      description:
        "Search Gmail messages using gog CLI. Returns JSON messages from `gog gmail messages search --json --no-input`.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Gmail search query (e.g. 'from:alerts@example.com newer_than:1d')"),
        max: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .optional()
          .default(20)
          .describe("Maximum number of messages to return (default: 20)"),
        includeBody: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include decoded message bodies in the response"),
        account: z
          .string()
          .optional()
          .describe("Gmail account or alias to use (defaults to GOG_ACCOUNT)"),
        timeoutSeconds: z
          .number()
          .int()
          .min(5)
          .max(120)
          .optional()
          .default(DEFAULT_TIMEOUT_SECONDS)
          .describe("Timeout for the gog command (default: 30s)"),
      }),
      execute: async (args: {
        query: string;
        max?: number;
        includeBody?: boolean;
        account?: string;
        timeoutSeconds?: number;
      }) => {
        try {
          ensureGogInstalled();
          const cmdArgs = [
            "gmail",
            "messages",
            "search",
            args.query,
            "--max",
            String(args.max ?? 20),
            "--json",
            "--no-input",
          ];
          if (args.includeBody) {
            cmdArgs.push("--include-body");
          }
          if (args.account) {
            cmdArgs.push("--account", args.account);
          }

          const result = await runGog(cmdArgs, args.timeoutSeconds);
          if (result.timedOut) {
            return formatResult({
              ...result,
              error: `gog gmail messages search timed out after ${args.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS}s`,
            });
          }
          if (result.exitCode !== 0) {
            return formatResult({
              ...result,
              error: `gog exited with code ${result.exitCode ?? "unknown"}`,
            });
          }

          const parsed = parseJsonOutput(result.stdout.trim());
          if (!parsed.ok) {
            return formatResult({
              ...result,
              error: `Failed to parse gog JSON output: ${parsed.error}`,
            });
          }

          const messages = Array.isArray(parsed.data?.messages)
            ? parsed.data.messages
            : [];
          const base = formatResult(result);
          return {
            ...base,
            count: messages.length,
            messages,
            data: parsed.data,
            summary: `Found ${messages.length} message(s) for "${args.query}"`,
          };
        } catch (err: any) {
          return formatResult({
            command: "gog gmail messages search",
            stdout: "",
            stderr: "",
            exitCode: null,
            timedOut: false,
            error: err?.message || String(err),
          });
        }
      },
    },
  };
}
