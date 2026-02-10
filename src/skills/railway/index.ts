import { z } from "zod";
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const MAX_CAPTURE_CHARS = 12000;
const DEFAULT_TAIL_LINES = 80;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_DISCOVERY_ATTEMPTS = 12;

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

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sanitizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function repoHintsFromCwd(cwd: string): string[] {
  const hints = new Set<string>();
  const base = path.basename(cwd).toLowerCase();
  if (base) {
    hints.add(base);
    hints.add(sanitizeName(base));
  }

  const gitConfigPath = path.join(cwd, ".git", "config");
  if (!fs.existsSync(gitConfigPath)) return Array.from(hints);

  const config = fs.readFileSync(gitConfigPath, "utf8");
  const urls = Array.from(config.matchAll(/^\s*url\s*=\s*(.+)\s*$/gm)).map(
    (m) => m[1].trim()
  );

  for (const url of urls) {
    // Supports:
    // - git@github.com:owner/repo.git
    // - https://github.com/owner/repo.git
    // - ssh://git@github.com/owner/repo.git
    const match =
      url.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/) ||
      url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) continue;
    const owner = match[1].toLowerCase();
    const repo = match[2].toLowerCase();
    hints.add(repo);
    hints.add(`${owner}/${repo}`);
    hints.add(sanitizeName(repo));
  }

  return Array.from(hints).filter(Boolean);
}

interface RailwayListProject {
  id: string;
  name: string;
  environments?: { edges?: Array<{ node?: { name?: string; canAccess?: boolean } }> };
  services?: {
    edges?: Array<{ node?: { id?: string; name?: string } }>;
  };
}

interface RailwayDiscoveryTarget {
  projectId: string;
  projectName: string;
  serviceName?: string;
  serviceId?: string;
  environmentName?: string;
  score: number;
}

function scoreTarget(
  projectName: string,
  serviceName: string | undefined,
  serviceHint: string | undefined,
  hints: string[]
): number {
  const pn = sanitizeName(projectName);
  const sn = serviceName ? sanitizeName(serviceName) : "";
  const sh = serviceHint ? sanitizeName(serviceHint) : "";
  let score = 0;

  for (const hint of hints) {
    const h = sanitizeName(hint);
    if (!h) continue;
    if (pn === h) score += 120;
    else if (pn.includes(h) || h.includes(pn)) score += 60;
    if (sn && (sn === h || sn.includes(h) || h.includes(sn))) score += 20;
  }

  if (sh && sn) {
    if (sn === sh) score += 220;
    else if (sn.includes(sh) || sh.includes(sn)) score += 120;
  }

  return score;
}

async function discoverTargets(
  cwd: string,
  serviceHint?: string
): Promise<RailwayDiscoveryTarget[]> {
  const listResult = await runRailway(["list", "--json"], cwd, 45);
  if (listResult.exitCode !== 0) return [];

  const projects = safeJsonParse<RailwayListProject[]>(listResult.stdout);
  if (!projects || !Array.isArray(projects)) return [];

  const hints = repoHintsFromCwd(cwd);
  const targets: RailwayDiscoveryTarget[] = [];

  for (const project of projects) {
    const projectName = project.name || "";
    const projectId = project.id;
    if (!projectId || !projectName) continue;
    const environments = project.environments?.edges ?? [];
    const preferredEnv =
      environments.find((e) => e?.node?.name?.toLowerCase() === "production")
        ?.node?.name ||
      environments.find((e) => e?.node?.canAccess)?.node?.name ||
      environments[0]?.node?.name;

    const services = project.services?.edges ?? [];
    if (services.length === 0) {
      targets.push({
        projectId,
        projectName,
        environmentName: preferredEnv,
        score: scoreTarget(projectName, undefined, serviceHint, hints),
      });
      continue;
    }

    for (const edge of services) {
      const serviceName = edge?.node?.name;
      const serviceId = edge?.node?.id;
      if (!serviceName && !serviceId) continue;
      if (serviceHint) {
        const sh = sanitizeName(serviceHint);
        const sn = sanitizeName(serviceName || "");
        if (sh && sn && !(sn.includes(sh) || sh.includes(sn))) {
          continue;
        }
      }
      targets.push({
        projectId,
        projectName,
        serviceName,
        serviceId,
        environmentName: preferredEnv,
        score: scoreTarget(projectName, serviceName, serviceHint, hints),
      });
    }
  }

  return targets.sort((a, b) => b.score - a.score);
}

async function runInDiscoveredContext(
  target: RailwayDiscoveryTarget,
  commandArgs: string[],
  timeoutSeconds: number
): Promise<{
  link: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; command: string };
  run: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; command: string };
}> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openviber-railway-"));
  try {
    const linkArgs = ["link", "--project", target.projectId];
    if (target.environmentName) {
      linkArgs.push("--environment", target.environmentName);
    }
    if (target.serviceName || target.serviceId) {
      linkArgs.push("--service", target.serviceName || target.serviceId || "");
    }
    const linkResult = await runRailway(linkArgs, tmpDir, 30);
    if (linkResult.exitCode !== 0) {
      return {
        link: linkResult,
        run: {
          exitCode: 1,
          stdout: "",
          stderr: "Link failed, command not executed",
          timedOut: false,
          command: `railway ${commandArgs.join(" ")}`,
        },
      };
    }
    const runResult = await runRailway(commandArgs, tmpDir, timeoutSeconds);
    return { link: linkResult, run: runResult };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runWithDiscovery(args: {
  cwd: string;
  serviceHint?: string;
  commandArgs: string[];
  timeoutSeconds?: number;
}): Promise<RailwayResult> {
  const timeoutSeconds = args.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const direct = await runRailway(args.commandArgs, args.cwd, timeoutSeconds);
  if (direct.exitCode === 0) {
    return formatResult({ ...direct, exitCode: direct.exitCode });
  }

  const targets = (await discoverTargets(args.cwd, args.serviceHint)).slice(
    0,
    MAX_DISCOVERY_ATTEMPTS
  );
  if (targets.length === 0) {
    const failed = formatResult({ ...direct, exitCode: direct.exitCode });
    return {
      ...failed,
      summary: `${failed.summary} | discovery=none`,
      output: [
        failed.output,
        "",
        "Discovery fallback: no candidate Railway projects/services were found.",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  let lastFailure: ReturnType<typeof formatResult> | null = null;
  for (const target of targets) {
    const discoveredRun = await runInDiscoveredContext(
      target,
      args.commandArgs,
      timeoutSeconds
    );
    const formatted = formatResult({
      command: `${discoveredRun.link.command} && ${discoveredRun.run.command}`,
      stdout: discoveredRun.run.stdout,
      stderr: discoveredRun.run.stderr || discoveredRun.link.stderr,
      exitCode: discoveredRun.run.exitCode,
      timedOut: discoveredRun.run.timedOut || discoveredRun.link.timedOut,
    });
    if (formatted.ok) {
      return {
        ...formatted,
        summary: `${formatted.summary} | discovery=matched project=${target.projectName} service=${target.serviceName || "default"} env=${target.environmentName || "default"}`,
      };
    }
    lastFailure = formatted;
  }

  return {
    ...(lastFailure ||
      formatResult({
        ...direct,
        exitCode: direct.exitCode,
      })),
    summary: `${
      (lastFailure ||
        formatResult({
          ...direct,
          exitCode: direct.exitCode,
        })).summary
    } | discovery=exhausted attempts=${targets.length}`,
  };
}

interface RailwayDeploymentListItem {
  id?: string;
  status?: string;
  createdAt?: string;
}

async function resolveLatestDeploymentId(
  cwd: string,
  service?: string
): Promise<string | null> {
  const args = ["deployment", "list", "--json", "--limit", "1"];
  if (service) args.push("--service", service);

  const result = await runWithDiscovery({
    cwd,
    serviceHint: service,
    commandArgs: args,
    timeoutSeconds: 45,
  });
  if (!result.ok) return null;
  const deployments = safeJsonParse<RailwayDeploymentListItem[]>(result.output);
  if (!deployments || !Array.isArray(deployments) || deployments.length === 0) {
    return null;
  }
  const id = deployments[0]?.id;
  return id && id.length > 0 ? id : null;
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
          const cmdArgs = args.service
            ? ["service", "status", "--json", "--service", args.service]
            : ["status", "--json"];
          return await runWithDiscovery({
            cwd,
            serviceHint: args.service,
            commandArgs: cmdArgs,
            timeoutSeconds: 45,
          });
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
        deploymentId: z
          .string()
          .optional()
          .describe(
            "Specific deployment ID. If omitted, the tool resolves the latest deployment first."
          ),
        cwd: z
          .string()
          .optional()
          .describe("Project directory (must be railway-linked)"),
      }),
      execute: async (args: {
        service?: string;
        lines?: number;
        deploymentId?: string;
        cwd?: string;
      }) => {
        try {
          ensureRailwayCli();
          const cwd = resolveWorkingDirectory(args.cwd);
          const deploymentId =
            args.deploymentId ??
            (await resolveLatestDeploymentId(cwd, args.service)) ??
            undefined;

          const cmdArgs = deploymentId
            ? ["logs", deploymentId, "--lines", String(args.lines ?? 50)]
            : ["logs", "--lines", String(args.lines ?? 50)];
          if (args.service) cmdArgs.push("--service", args.service);
          return await runWithDiscovery({
            cwd,
            serviceHint: args.service,
            commandArgs: cmdArgs,
            timeoutSeconds: 60,
          });
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
          return await runWithDiscovery({
            cwd,
            commandArgs: ["deployment", "list", "--json"],
            timeoutSeconds: 45,
          });
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
          return await runWithDiscovery({
            cwd,
            commandArgs: ["logs", "--build", args.deploymentId],
            timeoutSeconds: 60,
          });
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
