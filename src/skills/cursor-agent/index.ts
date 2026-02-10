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
 * Create a git branch for the work. Returns the branch name.
 */
function createBranch(cwd: string, branchName?: string, baseBranch?: string): string {
  try {
    // Check if we're in a git repo
    execSync("git rev-parse --git-dir", { cwd, encoding: "utf8", stdio: "pipe" });
  } catch {
    throw new Error(`Not a git repository: ${cwd}`);
  }

  // Generate branch name if not provided
  if (!branchName) {
    const timestamp = Date.now();
    branchName = `cursor-agent-${timestamp}`;
  }

  // Ensure we're on the base branch if specified
  if (baseBranch) {
    try {
      execSync(`git checkout ${baseBranch}`, { cwd, encoding: "utf8", stdio: "pipe" });
      execSync("git pull --ff-only", { cwd, encoding: "utf8", stdio: "pipe" });
    } catch (err: any) {
      throw new Error(`Failed to checkout base branch ${baseBranch}: ${err?.message || String(err)}`);
    }
  }

  // Create and checkout new branch
  try {
    execSync(`git checkout -b ${branchName}`, { cwd, encoding: "utf8", stdio: "pipe" });
    return branchName;
  } catch (err: any) {
    // Branch might already exist, try to checkout
    try {
      execSync(`git checkout ${branchName}`, { cwd, encoding: "utf8", stdio: "pipe" });
      return branchName;
    } catch {
      throw new Error(`Failed to create branch ${branchName}: ${err?.message || String(err)}`);
    }
  }
}

/**
 * Create a pull request using gh CLI. Returns the PR URL.
 */
function createPullRequest(
  cwd: string,
  title: string,
  body?: string,
  baseBranch?: string,
): string {
  try {
    // Check if gh CLI is available
    execSync("gh --version", { encoding: "utf8", stdio: "pipe" });
  } catch {
    throw new Error("GitHub CLI (gh) is not installed. Install it to create PRs automatically.");
  }

  // Get current branch
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

  // Build gh pr create command
  let cmd = `gh pr create --title ${JSON.stringify(title)}`;
  if (body) {
    cmd += ` --body ${JSON.stringify(body)}`;
  }
  if (baseBranch) {
    cmd += ` --base ${baseBranch}`;
  }

  try {
    const prUrl = execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
    return prUrl;
  } catch (err: any) {
    throw new Error(`Failed to create PR: ${err?.message || String(err)}`);
  }
}

/**
 * Commit and push changes. Returns the branch name.
 */
function commitAndPush(cwd: string, message: string): string {
  try {
    // Stage all changes
    execSync("git add -A", { cwd, encoding: "utf8", stdio: "pipe" });

    // Check if there are changes to commit
    try {
      execSync("git diff --cached --quiet", { cwd, encoding: "utf8", stdio: "pipe" });
      throw new Error("No changes to commit");
    } catch (err: any) {
      // diff --quiet exits with 1 when there are changes — this is expected
      if (err?.message === "No changes to commit") {
        throw err;
      }
    }

    // Commit
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, encoding: "utf8", stdio: "pipe" });

    // Get current branch
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();

    // Push (set upstream on first push)
    try {
      execSync(`git push -u origin ${branch}`, { cwd, encoding: "utf8", stdio: "pipe" });
    } catch {
      // If push fails, try force push (for rebased branches)
      execSync(`git push -u origin ${branch} --force-with-lease`, {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      });
    }

    return branch;
  } catch (err: any) {
    throw new Error(`Failed to commit and push: ${err?.message || String(err)}`);
  }
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
 * Progress update from cursor-agent execution
 */
export interface ProgressUpdate {
  elapsed: number;
  output: string;
  status: "starting" | "running" | "completed" | "timed_out";
  evidence?: string;
}

/**
 * Run Cursor CLI (agent) inside tmux so it gets a PTY.
 *
 * Improvements over v1:
 * - Polls for completion instead of fixed sleep
 * - Configurable session names for parallel runs
 * - Better output capture and parsing
 * - Handles workspace trust prompt automatically
 * - Reports intermediate progress updates
 */
function runInTmux(
  goal: string,
  cwd: string,
  waitSeconds: number,
  sessionName: string,
  onProgress?: (update: ProgressUpdate) => void,
): { output: string; completed: boolean; elapsed: number; progressUpdates: ProgressUpdate[] } {
  const session = safeSession(sessionName);
  const progressUpdates: ProgressUpdate[] = [];

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

  // Report starting status
  const startUpdate: ProgressUpdate = {
    elapsed: 0,
    output: "Starting Cursor agent...",
    status: "starting",
  };
  progressUpdates.push(startUpdate);
  onProgress?.(startUpdate);

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
  let lastReportedOutput = "";

  // Initial wait before first poll (let the agent start)
  execSync("sleep 5", { encoding: "utf8", stdio: "pipe" });

  while (Date.now() - startTime < maxWaitMs) {
    const output = captureTmuxPane(session);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Report progress if output has changed significantly
    if (output !== lastReportedOutput) {
      const newLines = output.slice(lastReportedOutput.length);
      if (newLines.trim().length > 0 || elapsed % 10 === 0) {
        // Report every 10 seconds or when new output appears
        const progressUpdate: ProgressUpdate = {
          elapsed,
          output: getTailLines(output, 50), // Show last 50 lines for progress
          status: "running",
        };
        progressUpdates.push(progressUpdate);
        onProgress?.(progressUpdate);
        lastReportedOutput = output;
      }
    }

    // Check for completion patterns
    const detection = detectCompletion(output);
    if (detection.completed) {
      completed = true;
      const finalUpdate: ProgressUpdate = {
        elapsed,
        output: getTailLines(output, 50),
        status: "completed",
        evidence: detection.evidence,
      };
      progressUpdates.push(finalUpdate);
      onProgress?.(finalUpdate);
      break;
    }

    // Check if output has stabilized (no new output for several polls)
    if (output === lastOutput) {
      stableCount++;
      // If output hasn't changed for ~15 seconds, likely done
      if (stableCount >= 5) {
        completed = true;
        const finalUpdate: ProgressUpdate = {
          elapsed,
          output: getTailLines(output, 50),
          status: "completed",
          evidence: "Output stabilized (no changes for 15+ seconds)",
        };
        progressUpdates.push(finalUpdate);
        onProgress?.(finalUpdate);
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

  if (!completed) {
    const timeoutUpdate: ProgressUpdate = {
      elapsed,
      output: getTailLines(finalOutput, 50),
      status: "timed_out",
      evidence: `Timeout after ${waitSeconds}s`,
    };
    progressUpdates.push(timeoutUpdate);
    onProgress?.(timeoutUpdate);
  }

  return { output: finalOutput, completed, elapsed, progressUpdates };
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
            "If true, create a new git branch before running the agent. Recommended for coding tasks to keep changes isolated. The branch name will be auto-generated unless branchName is provided.",
          ),
        branchName: z
          .string()
          .optional()
          .describe(
            "Name for the git branch (only used if createBranch is true). If not provided, a name like 'cursor-agent-{timestamp}' will be generated.",
          ),
        baseBranch: z
          .string()
          .optional()
          .describe(
            "Base branch to create from (only used if createBranch is true). Defaults to current branch.",
          ),
        createPR: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, after the agent completes successfully, commit changes, push to the branch, and create a pull request. Requires createBranch to be true and gh CLI to be installed.",
          ),
        prTitle: z
          .string()
          .optional()
          .describe(
            "Title for the pull request (only used if createPR is true). If not provided, will be generated from the goal.",
          ),
        prBody: z
          .string()
          .optional()
          .describe(
            "Body/description for the pull request (only used if createPR is true). Supports markdown. Can include 'Fixes #123' to auto-close issues.",
          ),
        commitMessage: z
          .string()
          .optional()
          .describe(
            "Commit message for changes (only used if createPR is true). If not provided, will be generated from the goal.",
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
        commitMessage?: string;
      }) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? DEFAULT_WAIT_SECONDS;
        const sessionName = args.sessionName ?? DEFAULT_SESSION;
        let createdBranch: string | undefined;
        let prUrl: string | undefined;

        try {
          // Create branch if requested
          if (args.createBranch) {
            try {
              createdBranch = createBranch(cwd, args.branchName, args.baseBranch);
            } catch (err: any) {
              return {
                ok: false,
                status: "error",
                error: `Failed to create branch: ${err?.message || String(err)}`,
                cwd,
                sessionName: safeSession(sessionName),
                hint: "Ensure you're in a git repository and the base branch exists.",
              };
            }
          }

          // Collect progress updates
          const progressUpdates: ProgressUpdate[] = [];
          const { output, completed, elapsed, progressUpdates: collectedUpdates } = runInTmux(
            args.goal,
            cwd,
            waitSeconds,
            sessionName,
            (update) => {
              progressUpdates.push(update);
            },
          );

          // Use collected updates (they're the same, but this ensures we have them)
          progressUpdates.push(...collectedUpdates);

          const outputTail = getTailLines(output);

          // If completed and createPR is requested, commit, push, and create PR
          if (completed && args.createPR) {
            if (!createdBranch) {
              return {
                ok: false,
                status: "error",
                error: "createPR requires createBranch to be true",
                cwd,
                elapsed,
                sessionName: safeSession(sessionName),
                progressUpdates,
              };
            }

            try {
              // Commit and push
              const commitMsg = args.commitMessage || `chore: ${args.goal.slice(0, 72)}`;
              const branch = commitAndPush(cwd, commitMsg);

              // Create PR
              const prTitle = args.prTitle || args.goal.slice(0, 100);
              const prBodyText = args.prBody || `Automated changes from Cursor agent:\n\n${args.goal}`;
              prUrl = createPullRequest(cwd, prTitle, prBodyText, args.baseBranch);
            } catch (err: any) {
              return {
                ok: false,
                status: "error",
                error: `Agent completed but failed to create PR: ${err?.message || String(err)}`,
                cwd,
                elapsed,
                sessionName: safeSession(sessionName),
                progressUpdates,
                outputTail,
                hint: "Changes may have been made but PR creation failed. Check git status manually.",
              };
            }
          }

          const status = completed ? "completed" : "timed_out";
          const summaryParts = [
            `status=${status}`,
            `cwd=${cwd}`,
            `elapsed=${elapsed}s`,
            `session=${safeSession(sessionName)}`,
          ];
          if (createdBranch) {
            summaryParts.push(`branch=${createdBranch}`);
          }
          if (prUrl) {
            summaryParts.push(`pr=${prUrl}`);
          }
          const summary = summaryParts.join(" | ");

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
            progressUpdates: progressUpdates.length > 0 ? progressUpdates : undefined,
            ...(createdBranch ? { branch: createdBranch } : {}),
            ...(prUrl ? { prUrl } : {}),
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
            hint: "Ensure tmux is installed (tmux_install_check) and Cursor CLI is in PATH (agent --version).",
          };
        }
      },
    },
  };
}
