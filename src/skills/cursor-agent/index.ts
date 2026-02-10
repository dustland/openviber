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
 * Progress update callback type
 */
type ProgressCallback = (update: {
  elapsed: number;
  output: string;
  status: "running" | "completed" | "timed_out";
}) => void;

/**
 * Run Cursor CLI (agent) inside tmux so it gets a PTY.
 *
 * Improvements over v1:
 * - Polls for completion instead of fixed sleep
 * - Configurable session names for parallel runs
 * - Better output capture and parsing
 * - Handles workspace trust prompt automatically
 * - Supports progress callbacks for intermediate updates
 */
function runInTmux(
  goal: string,
  cwd: string,
  waitSeconds: number,
  sessionName: string,
  onProgress?: ProgressCallback,
): { output: string; completed: boolean; elapsed: number; progressUpdates: string[] } {
  const session = safeSession(sessionName);
  const progressUpdates: string[] = [];

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
  let lastProgressTime = startTime;
  const PROGRESS_UPDATE_INTERVAL_MS = 10000; // Emit progress every 10 seconds

  // Initial wait before first poll (let the agent start)
  execSync("sleep 5", { encoding: "utf8", stdio: "pipe" });

  while (Date.now() - startTime < maxWaitMs) {
    const output = captureTmuxPane(session);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Emit progress updates periodically
    if (onProgress && Date.now() - lastProgressTime >= PROGRESS_UPDATE_INTERVAL_MS) {
      const tail = getTailLines(output, 30); // Show last 30 lines for progress
      const update = `[Progress ${elapsed}s] ${tail}`;
      progressUpdates.push(update);
      onProgress({
        elapsed,
        output: tail,
        status: "running",
      });
      lastProgressTime = Date.now();
    }

    // Check for completion patterns
    const detection = detectCompletion(output);
    if (detection.completed) {
      completed = true;
      if (onProgress) {
        onProgress({
          elapsed,
          output: getTailLines(output, 30),
          status: "completed",
        });
      }
      break;
    }

    // Check if output has stabilized (no new output for several polls)
    if (output === lastOutput) {
      stableCount++;
      // If output hasn't changed for ~15 seconds, likely done
      if (stableCount >= 5) {
        completed = true;
        if (onProgress) {
          onProgress({
            elapsed,
            output: getTailLines(output, 30),
            status: "completed",
          });
        }
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

  if (!completed && onProgress) {
    onProgress({
      elapsed,
      output: getTailLines(finalOutput, 30),
      status: "timed_out",
    });
  }

  return { output: finalOutput, completed, elapsed, progressUpdates };
}

export function getTools(): Record<string, import("../../core/tool").CoreTool> {
  return {
    cursor_agent_run: {
      description:
        "Run the Cursor CLI (agent) with the given prompt for AI-powered coding tasks. Call this whenever the user says 'use cursor-agent', 'cursor agent', 'run the Cursor CLI', or asks to delegate a coding task to Cursor. Provide a detailed, specific goal with context about the codebase. Runs in tmux (TTY required). Requires tmux and Cursor CLI installed. The tool collects intermediate progress updates during execution and returns them in the result. For coding tasks, set autoCreateBranch and autoCreatePR to automatically create a branch and PR after completion.",
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
        autoCreateBranch: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, automatically create a git branch before running the agent. Branch name will be auto-generated from the goal. Requires the repository to be a git repo.",
          ),
        autoCreatePR: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, automatically create a pull request after the agent completes successfully. Requires autoCreateBranch to be true and the github skill to be available. PR title and body will be auto-generated from the goal and changes.",
          ),
        prTitle: z
          .string()
          .optional()
          .describe(
            "Custom PR title (only used if autoCreatePR is true). If not provided, will be auto-generated from the goal.",
          ),
        prBody: z
          .string()
          .optional()
          .describe(
            "Custom PR body/description (only used if autoCreatePR is true). If not provided, will be auto-generated.",
          ),
      }),
      execute: async (args: {
        goal: string;
        cwd?: string;
        waitSeconds?: number;
        sessionName?: string;
        autoCreateBranch?: boolean;
        autoCreatePR?: boolean;
        prTitle?: string;
        prBody?: string;
      }, context?: any) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? DEFAULT_WAIT_SECONDS;
        const sessionName = args.sessionName ?? DEFAULT_SESSION;
        const autoCreateBranch = args.autoCreateBranch ?? false;
        const autoCreatePR = args.autoCreatePR ?? false;

        let branchName: string | undefined;
        let prUrl: string | undefined;

        try {
          // Create branch if requested
          if (autoCreateBranch || autoCreatePR) {
            try {
              // Check if it's a git repo
              execSync("git rev-parse --git-dir", {
                encoding: "utf8",
                stdio: "pipe",
                cwd,
              });

              // Generate branch name from goal (sanitize and make it git-friendly)
              const sanitized = args.goal
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 50);
              branchName = `cursor-agent/${sanitized}-${Date.now().toString().slice(-6)}`;

              // Get current branch
              let currentBranch: string;
              try {
                currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
                  encoding: "utf8",
                  stdio: "pipe",
                  cwd,
                }).trim();
              } catch {
                currentBranch = "main";
              }

              // Create and checkout branch
              execSync(`git checkout -b ${branchName}`, {
                encoding: "utf8",
                stdio: "pipe",
                cwd,
              });
            } catch (err: any) {
              // If git operations fail, continue without branch creation
              console.warn(`[cursor-agent] Failed to create branch: ${err?.message}`);
            }
          }

          // Progress callback that collects updates
          const progressUpdates: string[] = [];
          const onProgress: ProgressCallback = (update) => {
            const updateText = `[${update.status}] ${update.elapsed}s elapsed\n${update.output}`;
            progressUpdates.push(updateText);
          };

          const { output, completed, elapsed, progressUpdates: collectedUpdates } = runInTmux(
            args.goal,
            cwd,
            waitSeconds,
            sessionName,
            onProgress,
          );

          // Merge collected updates
          progressUpdates.push(...collectedUpdates);

          const outputTail = getTailLines(output);

          const status = completed ? "completed" : "timed_out";
          const summary = [
            `status=${status}`,
            `cwd=${cwd}`,
            `elapsed=${elapsed}s`,
            `session=${safeSession(sessionName)}`,
            ...(branchName ? [`branch=${branchName}`] : []),
          ].join(" | ");

          // Create PR if requested and completed successfully
          if (autoCreatePR && completed && branchName) {
            try {
              // Check if github tools are available
              const { defaultRegistry } = await import("../index");
              const githubTools = await defaultRegistry.getTools("github");
              
              if (githubTools?.gh_commit_and_push && githubTools?.gh_create_pr) {
                // Stage and commit changes
                try {
                  execSync("git add -A", { encoding: "utf8", stdio: "pipe", cwd });
                  
                  // Check if there are changes
                  try {
                    execSync("git diff --cached --quiet", { encoding: "utf8", stdio: "pipe", cwd });
                    // No changes
                  } catch {
                    // There are changes, commit them
                    const commitMessage = args.prTitle || `feat: ${args.goal.slice(0, 72)}`;
                    execSync(`git commit -m ${JSON.stringify(commitMessage)}`, {
                      encoding: "utf8",
                      stdio: "pipe",
                      cwd,
                    });

                    // Push branch
                    execSync(`git push -u origin ${branchName}`, {
                      encoding: "utf8",
                      stdio: "pipe",
                      cwd,
                    });

                    // Create PR
                    const prTitle = args.prTitle || `feat: ${args.goal.slice(0, 100)}`;
                    const prBodyText = args.prBody || 
                      `## Changes\n\n${args.goal}\n\n## Generated by Cursor Agent\n\nThis PR was automatically created after running cursor-agent.`;
                    
                    const prResult = await githubTools.gh_create_pr.execute({
                      cwd,
                      title: prTitle,
                      body: prBodyText,
                    });

                    if (prResult.ok && prResult.url) {
                      prUrl = prResult.url;
                    }
                  }
                } catch (err: any) {
                  console.warn(`[cursor-agent] Failed to create PR: ${err?.message}`);
                }
              }
            } catch (err: any) {
              console.warn(`[cursor-agent] GitHub tools not available: ${err?.message}`);
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
            progressUpdates: progressUpdates.length > 0 ? progressUpdates : undefined,
            ...(branchName ? { branch: branchName } : {}),
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
            ...(branchName ? { branch: branchName } : {}),
            hint: "Ensure tmux is installed (tmux_install_check) and Cursor CLI is in PATH (agent --version).",
          };
        }
      },
    },
  };
}
