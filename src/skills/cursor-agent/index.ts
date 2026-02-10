import { z } from "zod";
import { execSync, spawnSync } from "child_process";
import * as path from "path";

const DEFAULT_SESSION = "cursor-agent";
const DEFAULT_WAIT_SECONDS = 120;
const MIN_WAIT_SECONDS = 10;
const MAX_WAIT_SECONDS = 600;
const POLL_INTERVAL_MS = 3000;
const MAX_CAPTURE_LINES = 500;
const DEFAULT_TAIL_LINES = 100;
const PROGRESS_REPORT_INTERVAL_MS = 10000; // Report progress every 10 seconds

/** Patterns that indicate the Cursor agent has finished. */
const COMPLETION_PATTERNS = [
  /\$\s*$/m,                         // Shell prompt returned
  /agent\s+completed/i,              // Explicit completion message
  /All done/i,                       // Common completion phrase
  /Task completed/i,
  /changes have been (?:made|applied|committed)/i,
  /No (?:changes|modifications) (?:needed|required|made)/i,
];

/** Patterns that indicate the agent is still working. */
const IN_PROGRESS_PATTERNS = [
  /Thinking\.\.\./i,
  /Running\.\.\./i,
  /Searching\.\.\./i,
  /Reading\.\.\./i,
  /Writing\.\.\./i,
  /Editing\.\.\./i,
  /Applying\.\.\./i,
];

const SAFE_RE = /[^a-zA-Z0-9_.:-]/g;

function safeSession(name: string): string {
  return name.replace(SAFE_RE, "-");
}

/**
 * Capture pane output from a tmux session.
 */
function captureTmuxPane(session: string, lines: number = MAX_CAPTURE_LINES): string {
  try {
    return execSync(`tmux capture-pane -t ${session} -p -S -${lines}`, {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    return "";
  }
}

/**
 * Check if the Cursor agent appears to have finished based on pane output.
 */
function detectCompletion(output: string): { completed: boolean; evidence: string } {
  // Check for completion patterns
  const lastLines = output.split("\n").slice(-20).join("\n");
  for (const pattern of COMPLETION_PATTERNS) {
    if (pattern.test(lastLines)) {
      return { completed: true, evidence: `Matched pattern: ${pattern.source}` };
    }
  }

  // Check if still in-progress
  for (const pattern of IN_PROGRESS_PATTERNS) {
    if (pattern.test(lastLines)) {
      return { completed: false, evidence: `Still working: ${pattern.source}` };
    }
  }

  return { completed: false, evidence: "No completion signal detected" };
}

/**
 * Get the tail of output for chat-friendly display.
 */
function getTailLines(raw: string, maxLines: number = DEFAULT_TAIL_LINES): string {
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
 * Check if a directory is a git repository.
 */
function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", {
      encoding: "utf8",
      stdio: "pipe",
      cwd,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git branch name.
 */
function getCurrentBranch(cwd: string): string | null {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: "pipe",
      cwd,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Create a new git branch.
 */
function createBranch(cwd: string, branchName: string, baseBranch?: string): { ok: boolean; branch?: string; error?: string } {
  try {
    if (baseBranch) {
      execSync(`git checkout ${baseBranch}`, { encoding: "utf8", stdio: "pipe", cwd });
      execSync("git pull --ff-only", { encoding: "utf8", stdio: "pipe", cwd });
    }
    execSync(`git checkout -b ${branchName}`, { encoding: "utf8", stdio: "pipe", cwd });
    return { ok: true, branch: branchName };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Get git remote URL (for PR creation).
 */
function getRemoteUrl(cwd: string): string | null {
  try {
    return execSync("git config --get remote.origin.url", {
      encoding: "utf8",
      stdio: "pipe",
      cwd,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Parse repo owner/name from git remote URL.
 */
function parseRepoFromUrl(url: string): { owner: string; repo: string } | null {
  // Handle both https://github.com/owner/repo.git and git@github.com:owner/repo.git
  const match = url.match(/(?:github\.com[/:]|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  }
  return null;
}

/**
 * Create a pull request using gh CLI.
 */
function createPullRequest(
  cwd: string,
  title: string,
  body?: string,
  baseBranch?: string
): { ok: boolean; url?: string; error?: string } {
  try {
    let cmd = `gh pr create --title ${JSON.stringify(title)}`;
    if (body) {
      cmd += ` --body ${JSON.stringify(body)}`;
    }
    if (baseBranch) {
      cmd += ` --base ${baseBranch}`;
    }
    const url = execSync(cmd, { encoding: "utf8", stdio: "pipe", cwd }).trim();
    return { ok: true, url };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Run Cursor CLI (agent) inside tmux so it gets a PTY.
 *
 * Improvements over v1:
 * - Polls for completion instead of fixed sleep
 * - Configurable session names for parallel runs
 * - Better output capture and parsing
 * - Handles workspace trust prompt automatically
 * - Reports intermediate progress snapshots
 */
function runInTmux(
  goal: string,
  cwd: string,
  waitSeconds: number,
  sessionName: string,
): { output: string; completed: boolean; elapsed: number; progressSnapshots: Array<{ elapsed: number; output: string; status: string }> } {
  const session = safeSession(sessionName);

  // Ensure tmux session exists (create or reuse)
  execSync(
    `tmux has-session -t ${session} 2>/dev/null || tmux new-session -d -s ${session}`,
    { encoding: "utf8", stdio: "pipe" },
  );

  // cd to cwd
  const cdCmd = cwd.includes(" ")
    ? `cd "${cwd.replace(/"/g, '\\"')}"`
    : `cd ${cwd}`;
  spawnSync("tmux", ["send-keys", "-t", session, cdCmd, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Small delay for cd to complete
  execSync("sleep 1", { encoding: "utf8", stdio: "pipe" });

  // Send agent -p 'goal' (JSON.stringify handles escaping)
  const sendArg = `agent -p ${JSON.stringify(goal)}`;
  spawnSync("tmux", ["send-keys", "-t", session, sendArg, "Enter"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Handle workspace trust prompt: wait a few seconds, then send "a" to accept
  // (harmless if not prompted — just sends a character that gets ignored)
  execSync("sleep 3", { encoding: "utf8", stdio: "pipe" });
  spawnSync("tmux", ["send-keys", "-t", session, "a"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  // Poll for completion instead of fixed sleep
  const startTime = Date.now();
  const maxWaitMs = Math.max(MIN_WAIT_SECONDS, waitSeconds) * 1000;
  let lastOutput = "";
  let stableCount = 0;
  let completed = false;
  const progressSnapshots: Array<{ elapsed: number; output: string; status: string }> = [];
  let lastProgressReport = startTime;

  // Initial wait before first poll (let the agent start)
  execSync("sleep 5", { encoding: "utf8", stdio: "pipe" });

  while (Date.now() - startTime < maxWaitMs) {
    const output = captureTmuxPane(session);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Check for completion patterns
    const detection = detectCompletion(output);
    if (detection.completed) {
      completed = true;
      // Record final progress snapshot
      progressSnapshots.push({
        elapsed,
        output: getTailLines(output, 50),
        status: "completed",
      });
      break;
    }

    // Report progress periodically (every PROGRESS_REPORT_INTERVAL_MS)
    const now = Date.now();
    if (now - lastProgressReport >= PROGRESS_REPORT_INTERVAL_MS) {
      const status = detection.evidence || "in_progress";
      const snapshot = {
        elapsed,
        output: getTailLines(output, 50),
        status,
      };
      progressSnapshots.push(snapshot);
      lastProgressReport = now;
    }

    // Check if output has stabilized (no new output for several polls)
    if (output === lastOutput) {
      stableCount++;
      // If output hasn't changed for ~15 seconds, likely done
      if (stableCount >= 5) {
        completed = true;
        progressSnapshots.push({
          elapsed,
          output: getTailLines(output, 50),
          status: "completed (stabilized)",
        });
        break;
      }
    } else {
      stableCount = 0;
      lastOutput = output;
    }

    // Sleep before next poll
    execSync(`sleep ${Math.floor(POLL_INTERVAL_MS / 1000)}`, {
      encoding: "utf8",
      stdio: "pipe",
    });
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const finalOutput = captureTmuxPane(session);

  // Ensure we have at least one snapshot
  if (progressSnapshots.length === 0) {
    progressSnapshots.push({
      elapsed,
      output: getTailLines(finalOutput, 50),
      status: completed ? "completed" : "timed_out",
    });
  }

  return { output: finalOutput, completed, elapsed, progressSnapshots };
}

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    cursor_agent_run: {
      description:
        "Run the Cursor CLI (agent) with the given prompt for AI-powered coding tasks. Call this whenever the user says 'use cursor-agent', 'cursor agent', 'run the Cursor CLI', or asks to delegate a coding task to Cursor. Provide a detailed, specific goal with context about the codebase. Runs in tmux (TTY required). Requires tmux and Cursor CLI installed.",
      inputSchema: z.object({
        goal: z
          .string()
          .min(5)
          .describe(
            "Detailed task prompt for the Cursor agent. Best practice: include context about the codebase, specific files to modify, and acceptance criteria. Example: 'In the file src/utils/auth.ts, refactor the login function to use async/await instead of Promise chains. Ensure existing tests pass.'",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory for the agent — should be the project root. Defaults to current process cwd.",
          ),
        waitSeconds: z
          .number()
          .int()
          .min(MIN_WAIT_SECONDS)
          .max(MAX_WAIT_SECONDS)
          .optional()
          .default(DEFAULT_WAIT_SECONDS)
          .describe(
            `Maximum seconds to wait for the agent to complete (default: ${DEFAULT_WAIT_SECONDS}). The tool polls for completion rather than waiting the full duration. Increase for complex multi-file tasks.`,
          ),
        sessionName: z
          .string()
          .optional()
          .default(DEFAULT_SESSION)
          .describe(
            "Tmux session name (default: 'cursor-agent'). Use distinct names for parallel runs (e.g. 'cursor-1', 'cursor-2').",
          ),
        createBranch: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, create a new git branch before running the agent. Recommended for coding tasks. Branch name will be auto-generated from the goal if branchName is not provided.",
          ),
        branchName: z
          .string()
          .optional()
          .describe(
            "Name for the git branch to create (e.g. 'fix/issue-123' or 'feat/add-widget'). Auto-generated from goal if not provided and createBranch is true.",
          ),
        baseBranch: z
          .string()
          .optional()
          .describe(
            "Base branch to create the new branch from (default: current branch or 'main'). Only used if createBranch is true.",
          ),
        createPR: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, create a pull request after the agent completes successfully. Requires createBranch to be true and a git repository with GitHub remote.",
          ),
        prTitle: z
          .string()
          .optional()
          .describe(
            "Title for the pull request. Auto-generated from goal if not provided and createPR is true.",
          ),
        prBody: z
          .string()
          .optional()
          .describe(
            "Body/description for the pull request (supports markdown). Auto-generated if not provided and createPR is true.",
          ),
        prBaseBranch: z
          .string()
          .optional()
          .describe(
            "Target branch for the PR (default: repo default branch, usually 'main' or 'master').",
          ),
      }),
      execute: async (args: {
        goal: string;
        cwd?: string;
        waitSeconds?: number;
        sessionName?: string;
        createBranch?: boolean;
        branchName?: string;
        baseBranch?: string;
        createPR?: boolean;
        prTitle?: string;
        prBody?: string;
        prBaseBranch?: string;
      }) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? DEFAULT_WAIT_SECONDS;
        const sessionName = args.sessionName ?? DEFAULT_SESSION;
        const createBranch = args.createBranch ?? false;
        const createPR = args.createPR ?? false;

        let branchCreated = false;
        let branchName: string | null = null;
        let prCreated = false;
        let prUrl: string | null = null;

        try {
          // Create branch if requested
          if (createBranch) {
            if (!isGitRepo(cwd)) {
              return {
                ok: false,
                status: "error",
                error: "Not a git repository. Cannot create branch.",
                cwd,
                hint: "Initialize git repository first or run without createBranch option.",
              };
            }

            // Generate branch name if not provided
            if (!args.branchName) {
              // Create a branch name from the goal (sanitized)
              const sanitized = args.goal
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 50);
              branchName = `cursor-agent/${sanitized}`;
            } else {
              branchName = args.branchName;
            }

            const branchResult = createBranch(cwd, branchName, args.baseBranch);
            if (!branchResult.ok) {
              return {
                ok: false,
                status: "error",
                error: `Failed to create branch: ${branchResult.error}`,
                cwd,
              };
            }
            branchCreated = true;
          }

          // Run the agent and collect progress snapshots
          const { output, completed, elapsed, progressSnapshots } = runInTmux(
            args.goal,
            cwd,
            waitSeconds,
            sessionName,
          );

          const outputTail = getTailLines(output);

          const status = completed ? "completed" : "timed_out";
          const summary = [
            `status=${status}`,
            `cwd=${cwd}`,
            `elapsed=${elapsed}s`,
            `session=${safeSession(sessionName)}`,
            ...(branchCreated ? [`branch=${branchName}`] : []),
            ...(prCreated ? [`pr=${prUrl}`] : []),
          ].join(" | ");

          // Create PR if requested and completed successfully
          if (createPR && completed && branchCreated) {
            const remoteUrl = getRemoteUrl(cwd);
            if (!remoteUrl) {
              return {
                ok: true,
                status,
                summary,
                outputTail,
                output: output.length > 12000
                  ? output.slice(0, 6000) + `\n...[truncated ${output.length - 12000} chars]...\n` + output.slice(-6000)
                  : output,
                cwd,
                elapsed,
                sessionName: safeSession(sessionName),
                branchName,
                progressSnapshots,
                warning: "Cannot create PR: no git remote found.",
              };
            }

            const repo = parseRepoFromUrl(remoteUrl);
            if (!repo) {
              return {
                ok: true,
                status,
                summary,
                outputTail,
                output: output.length > 12000
                  ? output.slice(0, 6000) + `\n...[truncated ${output.length - 12000} chars]...\n` + output.slice(-6000)
                  : output,
                cwd,
                elapsed,
                sessionName: safeSession(sessionName),
                branchName,
                progressSnapshots,
                warning: "Cannot create PR: could not parse repository from remote URL.",
              };
            }

            // Generate PR title and body if not provided
            const prTitle = args.prTitle || args.goal.slice(0, 100);
            const prBody = args.prBody || `Automated changes from Cursor Agent:\n\n${args.goal}\n\nThis PR was created automatically after running the Cursor CLI agent.`;

            // Check if there are changes to commit
            try {
              execSync("git diff --quiet", { encoding: "utf8", stdio: "pipe", cwd });
              // No changes
              return {
                ok: true,
                status,
                summary,
                outputTail,
                output: output.length > 12000
                  ? output.slice(0, 6000) + `\n...[truncated ${output.length - 12000} chars]...\n` + output.slice(-6000)
                  : output,
                cwd,
                elapsed,
                sessionName: safeSession(sessionName),
                branchName,
                progressSnapshots,
                warning: "No changes to commit. PR not created.",
              };
            } catch {
              // There are changes, proceed with commit and PR
            }

            // Stage, commit, and push changes
            try {
              execSync("git add -A", { encoding: "utf8", stdio: "pipe", cwd });
              execSync(`git commit -m ${JSON.stringify(prTitle)}`, {
                encoding: "utf8",
                stdio: "pipe",
                cwd,
              });
              execSync(`git push -u origin ${branchName}`, {
                encoding: "utf8",
                stdio: "pipe",
                cwd,
              });
            } catch (err: any) {
              return {
                ok: true,
                status,
                summary,
                outputTail,
                output: output.length > 12000
                  ? output.slice(0, 6000) + `\n...[truncated ${output.length - 12000} chars]...\n` + output.slice(-6000)
                  : output,
                cwd,
                elapsed,
                sessionName: safeSession(sessionName),
                branchName,
                progressSnapshots,
                warning: `Failed to commit/push changes: ${err?.message || String(err)}`,
              };
            }

            // Create PR
            const prResult = createPullRequest(cwd, prTitle, prBody, args.prBaseBranch);
            if (prResult.ok && prResult.url) {
              prCreated = true;
              prUrl = prResult.url;
            } else {
              return {
                ok: true,
                status,
                summary,
                outputTail,
                output: output.length > 12000
                  ? output.slice(0, 6000) + `\n...[truncated ${output.length - 12000} chars]...\n` + output.slice(-6000)
                  : output,
                cwd,
                elapsed,
                sessionName: safeSession(sessionName),
                branchName,
                progressSnapshots,
                warning: `Failed to create PR: ${prResult.error}`,
              };
            }
          }

          return {
            ok: completed,
            status,
            summary,
            outputTail,
            output: output.length > 12000
              ? output.slice(0, 6000) + `\n...[truncated ${output.length - 12000} chars]...\n` + output.slice(-6000)
              : output,
            cwd,
            elapsed,
            sessionName: safeSession(sessionName),
            ...(branchCreated ? { branchName } : {}),
            ...(prCreated ? { prUrl } : {}),
            progressSnapshots,
            ...(completed ? {} : {
              error: `Agent did not complete within ${waitSeconds}s (may still be running).`,
              hint: "Check with tmux_list or increase waitSeconds.",
            }),
          };
        } catch (err: any) {
          return {
            ok: false,
            status: "error",
            error: err?.message || String(err),
            cwd,
            sessionName: safeSession(sessionName),
            ...(branchCreated && branchName ? { branchName } : {}),
            hint: "Ensure tmux is installed (tmux_install_check) and Cursor CLI is in PATH (agent --version).",
          };
        }
      },
    },
  };
}
