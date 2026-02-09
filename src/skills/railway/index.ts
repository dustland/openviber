import { z } from "zod";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

const MAX_CAPTURE_CHARS = 12000;
const DEFAULT_TAIL_LINES = 80;
const DEFAULT_TIMEOUT_SECONDS = 30;

// ==================== Helpers ====================

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

function ensureRailwayCli(): void {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    if (fs.existsSync(path.join(entry, "railway"))) return;
    if (fs.existsSync(path.join(entry, "railway.exe"))) return;
  }
  throw new Error(
    "Railway CLI not found in PATH. Install with `npm install -g @railway/cli` or `brew install railway`, then run `railway login`."
  );
}

function resolveWorkingDirectory(rawCwd?: string): string {
  const cwd = rawCwd ? path.resolve(rawCwd) : process.cwd();
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    throw new Error(`Working directory does not exist or is not a directory: ${cwd}`);
  }
  return cwd;
}

/**
 * Execute a Railway CLI command and capture output.
 */
async function runRailway(
  args: string[],
  cwd: string,
  timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; command: string }> {
  const command = `railway ${args.join(" ")}`;

  return new Promise((resolve, reject) => {
    const child = execFile(
      "railway",
      args,
      {
        cwd,
        timeout: timeoutSeconds * 1000,
        maxBuffer: 5 * 1024 * 1024,
        env: process.env,
      },
      (error, stdout, stderr) => {
        const timedOut = error?.killed === true;
        const exitCode = error ? (error as any).code ?? 1 : 0;
        resolve({
          exitCode: typeof exitCode === "number" ? exitCode : 1,
          stdout: stdout || "",
          stderr: stderr || "",
          timedOut,
          command,
        });
      }
    );

    child.on("error", (err) => {
      reject(err);
    });
  });
}

type RailwayResult = {
  ok: boolean;
  command: string;
  output: string;
  stdoutTail: string;
  stderrTail: string;
  error?: string;
  summary: string;
};

function formatResult(args: {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}): RailwayResult {
  const merged = truncateOutput(
    [args.stdout.trim(), args.stderr.trim()].filter(Boolean).join("\n\n")
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
    error: args.error,
    summary: `status=${status} | exitCode=${args.exitCode ?? "unknown"}`,
  };
}

// ==================== Tool exports ====================

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    railway_status: {
      description:
        "Get Railway deployment status for the linked project or a specific service. Shows service health, deployment state, and URLs.",
      inputSchema: z.object({
        service: z
          .string()
          .optional()
          .describe("Service name to check (omit for all services)"),
        cwd: z
          .string()
          .optional()
          .describe("Project directory (must be railway-linked)"),
      }),
      execute: async (args: { service?: string; cwd?: string }) => {
        try {
          ensureRailwayCli();
          const cwd = resolveWorkingDirectory(args.cwd);
          const cmdArgs = ["status", "--json"];
          if (args.service) cmdArgs.push("--service", args.service);
          const result = await runRailway(cmdArgs, cwd);
          return formatResult({ ...result, exitCode: result.exitCode });
        } catch (err: any) {
          return {
            ok: false,
            command: "railway status",
            output: "",
            stdoutTail: "",
            stderrTail: "",
            error: err?.message || String(err),
            summary: "status=failed",
          };
        }
      },
    },

    railway_logs: {
      description:
        "View recent deployment logs from Railway. Useful for debugging deployment failures or monitoring runtime behavior.",
      inputSchema: z.object({
        service: z
          .string()
          .optional()
          .describe("Service name to get logs for"),
        lines: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .default(50)
          .describe("Number of log lines to retrieve (default: 50)"),
        cwd: z
          .string()
          .optional()
          .describe("Project directory (must be railway-linked)"),
      }),
      execute: async (args: { service?: string; lines?: number; cwd?: string }) => {
        try {
          ensureRailwayCli();
          const cwd = resolveWorkingDirectory(args.cwd);
          const cmdArgs = ["logs", "--lines", String(args.lines ?? 50)];
          if (args.service) cmdArgs.push("--service", args.service);
          const result = await runRailway(cmdArgs, cwd, 60);
          return formatResult({ ...result, exitCode: result.exitCode });
        } catch (err: any) {
          return {
            ok: false,
            command: "railway logs",
            output: "",
            stdoutTail: "",
            stderrTail: "",
            error: err?.message || String(err),
            summary: "status=failed",
          };
        }
      },
    },

    railway_deploy: {
      description:
        "Trigger a redeployment on Railway. Deploys the latest code to the linked service.",
      inputSchema: z.object({
        service: z
          .string()
          .optional()
          .describe("Service name to redeploy"),
        cwd: z
          .string()
          .optional()
          .describe("Project directory (must be railway-linked)"),
      }),
      execute: async (args: { service?: string; cwd?: string }) => {
        try {
          ensureRailwayCli();
          const cwd = resolveWorkingDirectory(args.cwd);
          const cmdArgs = ["up", "--detach"];
          if (args.service) cmdArgs.push("--service", args.service);
          const result = await runRailway(cmdArgs, cwd, 120);
          return formatResult({ ...result, exitCode: result.exitCode });
        } catch (err: any) {
          return {
            ok: false,
            command: "railway up",
            output: "",
            stdoutTail: "",
            stderrTail: "",
            error: err?.message || String(err),
            summary: "status=failed",
          };
        }
      },
    },

    railway_run: {
      description:
        "Run any Railway CLI command directly. Use for operations not covered by other railway tools (e.g. `variables list`, `domain list`, `environment`).",
      inputSchema: z.object({
        command: z
          .string()
          .min(1)
          .describe(
            "Railway CLI subcommand and arguments (e.g. 'variables list', 'domain list', 'environment')"
          ),
        cwd: z
          .string()
          .optional()
          .describe("Project directory (must be railway-linked)"),
      }),
      execute: async (args: { command: string; cwd?: string }) => {
        try {
          ensureRailwayCli();
          const cwd = resolveWorkingDirectory(args.cwd);
          const cmdArgs = args.command.split(/\s+/).filter(Boolean);
          const result = await runRailway(cmdArgs, cwd, 60);
          return formatResult({ ...result, exitCode: result.exitCode });
        } catch (err: any) {
          return {
            ok: false,
            command: `railway ${args.command}`,
            output: "",
            stdoutTail: "",
            stderrTail: "",
            error: err?.message || String(err),
            summary: "status=failed",
          };
        }
      },
    },

    railway_deployments: {
      description:
        "List recent deployments for the linked Railway service. Shows deployment IDs, status (SUCCESS/FAILED/BUILDING), and timestamps. Use this to find failed deployments before fetching their build logs.",
      inputSchema: z.object({
        cwd: z
          .string()
          .optional()
          .describe("Project directory (must be railway-linked)"),
      }),
      execute: async (args: { cwd?: string }) => {
        try {
          ensureRailwayCli();
          const cwd = resolveWorkingDirectory(args.cwd);
          const result = await runRailway(["deployment", "list"], cwd, 30);
          return formatResult({ ...result, exitCode: result.exitCode });
        } catch (err: any) {
          return {
            ok: false,
            command: "railway deployment list",
            output: "",
            stdoutTail: "",
            stderrTail: "",
            error: err?.message || String(err),
            summary: "status=failed",
          };
        }
      },
    },

    railway_build_logs: {
      description:
        "Fetch build logs for a specific Railway deployment by its deployment ID. Use this to diagnose build failures. Get the deployment ID from railway_deployments first.",
      inputSchema: z.object({
        deploymentId: z
          .string()
          .min(1)
          .describe("Deployment ID (UUID from railway_deployments output)"),
        cwd: z
          .string()
          .optional()
          .describe("Project directory (must be railway-linked)"),
      }),
      execute: async (args: { deploymentId: string; cwd?: string }) => {
        try {
          ensureRailwayCli();
          const cwd = resolveWorkingDirectory(args.cwd);
          const result = await runRailway(
            ["logs", "-d", args.deploymentId],
            cwd,
            60
          );
          return formatResult({ ...result, exitCode: result.exitCode });
        } catch (err: any) {
          return {
            ok: false,
            command: `railway logs -d ${args.deploymentId}`,
            output: "",
            stdoutTail: "",
            stderrTail: "",
            error: err?.message || String(err),
            summary: "status=failed",
          };
        }
      },
    },
  };
}
