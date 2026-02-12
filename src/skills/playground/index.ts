import { execSync } from "child_process";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { defaultRegistry } from "../registry";
import type { SkillPlaygroundSpec } from "../types";
import { ViberPaths } from "../../utils/paths";

const DEFAULT_WAIT_SECONDS = 120;
const MIN_WAIT_SECONDS = 10;
const MAX_WAIT_SECONDS = 600;
const DEFAULT_CLONE_DEPTH = 1;
const GIT_TIMEOUT_MS = 120_000;

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]+$/;

const playgroundSpecSchema = z.object({
  repo: z.string(),
  file: z.string(),
  branch: z.string().optional(),
  cloneDepth: z.number().int().min(1).max(50).optional(),
  prompt: z.string().optional(),
});

type RepoStatus = "cloned" | "updated" | "existing";

function gitExec(args: string, cwd?: string): string {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    stdio: "pipe",
    cwd,
    timeout: GIT_TIMEOUT_MS,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  }).trim();
}

function ensureSafeRepo(repo: string): { owner: string; name: string } {
  if (!REPO_PATTERN.test(repo)) {
    throw new Error(`Invalid repo format: ${repo}`);
  }
  const [owner, name] = repo.split("/");
  return { owner, name };
}

function ensureSafeRef(ref: string): void {
  if (!REF_PATTERN.test(ref)) {
    throw new Error(`Invalid git ref: ${ref}`);
  }
}

function resolvePlaygroundFile(repoDir: string, file: string): string {
  if (path.isAbsolute(file)) {
    throw new Error("Playground file must be a relative path.");
  }
  const normalized = path.normalize(file);
  if (normalized.split(path.sep).includes("..")) {
    throw new Error("Playground file must not traverse parent directories.");
  }
  return path.join(repoDir, normalized);
}

function applyTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function buildCursorAgentPrompt(
  spec: SkillPlaygroundSpec,
  repoDir: string,
): string {
  const template = spec.prompt?.trim();
  const values = {
    repo: spec.repo,
    file: spec.file,
    repoPath: repoDir,
  };

  if (template) {
    return applyTemplate(template, values);
  }

  return [
    "You are verifying that the cursor-agent skill works end-to-end.",
    "",
    `Repository: ${spec.repo}`,
    `Local path: ${repoDir}`,
    "",
    "Task:",
    `1. Pick exactly one file to review (prefer ${spec.file} if it exists).`,
    "2. Read the file and provide a concise review (bugs, clarity, maintainability).",
    "3. Do NOT modify files and do NOT run tests.",
    "",
    "Respond with:",
    "- First line: PLAYGROUND_OK",
    "- Then 3-5 bullet points",
    "- Finish with a short summary paragraph",
  ].join("\n");
}

async function ensureRepo(
  spec: SkillPlaygroundSpec,
  refreshRepo: boolean,
): Promise<{ path: string; status: RepoStatus }> {
  const { owner, name } = ensureSafeRepo(spec.repo);
  const playgroundRoot = ViberPaths.playgrounds();
  const repoRoot = path.join(playgroundRoot, "repos", owner);
  const repoDir = path.join(repoRoot, name);

  await fsPromises.mkdir(repoRoot, { recursive: true });

  const gitDir = path.join(repoDir, ".git");
  const depth = spec.cloneDepth ?? DEFAULT_CLONE_DEPTH;

  if (spec.branch) {
    ensureSafeRef(spec.branch);
  }

  if (fs.existsSync(gitDir)) {
    if (refreshRepo) {
      gitExec("fetch --prune origin", repoDir);
      if (spec.branch) {
        gitExec(`checkout ${spec.branch}`, repoDir);
        gitExec(`reset --hard origin/${spec.branch}`, repoDir);
      } else {
        gitExec("reset --hard origin/HEAD", repoDir);
      }
      return { path: repoDir, status: "updated" };
    }
    return { path: repoDir, status: "existing" };
  }

  const cloneArgs = [
    "clone",
    "--depth",
    String(depth),
    ...(spec.branch ? ["--branch", spec.branch] : []),
    `https://github.com/${spec.repo}.git`,
    JSON.stringify(repoDir),
  ];
  gitExec(cloneArgs.join(" "));
  return { path: repoDir, status: "cloned" };
}

async function runCursorAgentPlayground(args: {
  skillId: string;
  spec: SkillPlaygroundSpec;
  waitSeconds: number;
  refreshRepo: boolean;
}) {
  const repo = await ensureRepo(args.spec, args.refreshRepo);
  const filePath = resolvePlaygroundFile(repo.path, args.spec.file);

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      skillId: args.skillId,
      error: `Playground file not found: ${args.spec.file}`,
      playground: { ...args.spec, repoPath: repo.path, repoStatus: repo.status },
    };
  }

  let terminalStatus: any = undefined;
  try {
    const terminalTools = await defaultRegistry.getTools("terminal");
    if (terminalTools.terminal_check) {
      terminalStatus = await terminalTools.terminal_check.execute({});
      if (!terminalStatus?.available) {
        return {
          ok: false,
          skillId: args.skillId,
          error: "Terminal backend not available (required for cursor-agent).",
          playground: { ...args.spec, repoPath: repo.path, repoStatus: repo.status },
          terminal: terminalStatus,
        };
      }
    }
  } catch (error: any) {
    return {
      ok: false,
      skillId: args.skillId,
      error: `Failed to load terminal tools: ${error?.message || String(error)}`,
      playground: { ...args.spec, repoPath: repo.path, repoStatus: repo.status },
    };
  }

  const cursorTools = await defaultRegistry.getTools("cursor-agent");
  const cursorRun = cursorTools.cursor_agent_run;
  if (!cursorRun) {
    return {
      ok: false,
      skillId: args.skillId,
      error: "cursor_agent_run tool not found.",
      playground: { ...args.spec, repoPath: repo.path, repoStatus: repo.status },
    };
  }

  const prompt = buildCursorAgentPrompt(args.spec, repo.path);
  const runResult = await cursorRun.execute({
    goal: prompt,
    cwd: repo.path,
    waitSeconds: args.waitSeconds,
    sessionName: "cursor-playground",
  });

  const outputText =
    typeof runResult.outputTail === "string"
      ? runResult.outputTail
      : typeof runResult.output === "string"
        ? runResult.output
        : "";
  const marker = "PLAYGROUND_OK";
  const markerFound = outputText.includes(marker);

  return {
    ok: runResult.ok,
    skillId: args.skillId,
    playground: {
      ...args.spec,
      repoPath: repo.path,
      repoStatus: repo.status,
      prompt,
    },
    verification: {
      marker,
      markerFound,
      warning:
        runResult.ok && !markerFound
          ? "Output did not include the PLAYGROUND_OK marker."
          : undefined,
    },
    terminal: terminalStatus,
    run: runResult,
  };
}

/**
 * Build tools for running skill playground verifications.
 */
export function getTools(): Record<string, import("../../viber/tool").CoreTool> {
  return {
    skill_playground_verify: {
      description:
        "Run a skill's playground scenario to verify it works end-to-end. Use when the user asks to verify a skill or wants a quick smoke test (e.g. cursor-agent).",
      inputSchema: z.object({
        skillId: z
          .string()
          .min(2)
          .describe("Skill ID to verify (e.g. 'cursor-agent')."),
        waitSeconds: z
          .number()
          .int()
          .min(MIN_WAIT_SECONDS)
          .max(MAX_WAIT_SECONDS)
          .optional()
          .default(DEFAULT_WAIT_SECONDS)
          .describe(
            `Maximum seconds to wait for CLI-based skills (default: ${DEFAULT_WAIT_SECONDS}).`,
          ),
        refreshRepo: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to update the playground repo before running."),
      }),
      execute: async (args: {
        skillId: string;
        waitSeconds?: number;
        refreshRepo?: boolean;
      }) => {
        try {
          await defaultRegistry.loadAll();

          const skill = defaultRegistry.getSkill(args.skillId);
          if (!skill) {
            return { ok: false, error: `Skill not found: ${args.skillId}` };
          }

          const parsed = playgroundSpecSchema.safeParse(skill.metadata.playground);
          if (!parsed.success) {
            return {
              ok: false,
              skillId: args.skillId,
              error: `Skill '${args.skillId}' does not define a playground scenario.`,
            };
          }

          const spec = parsed.data;
          if (!REPO_PATTERN.test(spec.repo)) {
            return {
              ok: false,
              skillId: args.skillId,
              error: `Invalid playground repo format: ${spec.repo}`,
            };
          }

          const waitSeconds = Math.min(
            MAX_WAIT_SECONDS,
            Math.max(MIN_WAIT_SECONDS, args.waitSeconds ?? DEFAULT_WAIT_SECONDS),
          );

          if (args.skillId === "cursor-agent") {
            return await runCursorAgentPlayground({
              skillId: args.skillId,
              spec,
              waitSeconds,
              refreshRepo: args.refreshRepo ?? true,
            });
          }

          return {
            ok: false,
            skillId: args.skillId,
            error: `No playground runner is implemented for '${args.skillId}'.`,
          };
        } catch (error: any) {
          return {
            ok: false,
            skillId: args?.skillId ?? "unknown",
            error: error?.message || String(error),
          };
        }
      },
    },
  };
}
