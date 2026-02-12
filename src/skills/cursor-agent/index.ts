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
 * Check if a directory is a git repository.
 */
function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", {
      encoding: "utf8",
      stdio: "pipe",
      cwd,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a branch name from a task goal.
 */
function generateBranchName(goal: string): string {
  // Extract key words and create a slug
  const words = goal
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["the", "and", "for", "with", "from", "that", "this"].includes(w))
    .slice(0, 4);
  
  const slug = words.join("-").slice(0, 40);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `cursor-agent/${timestamp}-${slug || "task"}`;
}

/**
 * Enhance a coding task prompt with git workflow instructions.
 * Automatically adds branch creation and PR creation steps if:
 * - The directory is a git repository
 * - The prompt doesn't already mention branch/PR creation
 * - The prompt appears to be a coding task (mentions files, functions, code changes)
 */
function enhancePromptForCodingTask(goal: string, cwd: string): string {
  // Check if it's a git repo
  if (!isGitRepo(cwd)) {
    return goal;
  }

  // Check if prompt already includes branch/PR instructions
  const hasBranchInstruction = /\b(create|make|new).*branch|branch.*named|checkout.*-b/i.test(goal);
  const hasPRInstruction = /\b(create|make|open).*(?:pull request|pr|merge request)|pr.*create/i.test(goal);
  const hasCommitInstruction = /\b(commit|push|git commit|git push)/i.test(goal);

  // If already has git workflow instructions, don't modify
  if (hasBranchInstruction && (hasPRInstruction || hasCommitInstruction)) {
    return goal;
  }

  // Check if it looks like a coding task (mentions files, functions, code changes)
  const isCodingTask = /\b(file|function|class|method|code|implement|fix|add|refactor|update|modify|change|create|write|edit)/i.test(goal);
  
  if (!isCodingTask) {
    return goal;
  }

  // Generate branch name
  const branchName = generateBranchName(goal);

  // Build enhanced prompt
  const parts: string[] = [];
  
  // Add branch creation instruction if not present
  if (!hasBranchInstruction) {
    parts.push(`First, create a new git branch named "${branchName}" and switch to it.`);
  }

  // Add the original goal
  parts.push(goal);

  // Add commit/push/PR instructions if not present
  if (!hasCommitInstruction || !hasPRInstruction) {
    parts.push(`\n\nWhen you have completed the task:`);
    if (!hasCommitInstruction) {
      parts.push(`- Commit all changes with a descriptive commit message`);
      parts.push(`- Push the branch to the remote repository`);
    }
    if (!hasPRInstruction) {
      parts.push(`- Create a pull request with a clear title and description of the changes`);
    }
  }

  return parts.join(" ");
}


/**
 * Run Cursor CLI (agent) inside tmux so it gets a PTY.
 *
 * Improvements over v1:
 * - Polls for completion instead of fixed sleep
 * - Configurable session names for parallel runs
 * - Better output capture and parsing
 * - Handles workspace trust prompt automatically
 * - Emits intermediate progress updates via callback
 */
function runInTmux(
  goal: string,
  cwd: string,
  waitSeconds: number,
  sessionName: string,
  onProgress?: (event: { kind: string; phase?: string; message?: string; data?: any }) => void,
): { output: string; completed: boolean; elapsed: number } {
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

  // Initial wait before first poll (let the agent start)
  execSync("sleep 5", { encoding: "utf8", stdio: "pipe" });
  
  // Emit initial progress
  if (onProgress) {
    onProgress({
      kind: "status",
      phase: "starting",
      message: "Starting Cursor agent...",
      data: { goal, cwd, sessionName },
    });
  }

  while (Date.now() - startTime < maxWaitMs) {
    const output = captureTmuxPane(session);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Emit intermediate progress with latest output
    if (onProgress && output !== lastOutput) {
      const tail = getTailLines(output, 20);
      const detection = detectCompletion(output);
      onProgress({
        kind: "progress",
        phase: detection.completed ? "completing" : "working",
        message: detection.completed 
          ? "Agent appears to be completing..." 
          : `Agent is working... (${elapsed}s elapsed)`,
        data: {
          elapsed,
          outputTail: tail,
          evidence: detection.evidence,
        },
      });
    }

    // Check for completion patterns
    const detection = detectCompletion(output);
    if (detection.completed) {
      completed = true;
      if (onProgress) {
        onProgress({
          kind: "status",
          phase: "completed",
          message: "Cursor agent completed successfully",
          data: { elapsed, evidence: detection.evidence },
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
            kind: "status",
            phase: "completed",
            message: "Cursor agent appears to have finished (output stabilized)",
            data: { elapsed },
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

  return { output: finalOutput, completed, elapsed };
}

export function getTools(): Record<string, import("../../viber/tool").CoreTool> {
  return {
    cursor_agent_run: {
      description:
        "Run the Cursor CLI (agent) with the given prompt for AI-powered coding tasks. Call this whenever the user says 'use cursor-agent', 'cursor agent', 'run the Cursor CLI', or asks to delegate a coding task to Cursor. Provide a detailed, specific goal with context about the codebase. For coding tasks in git repositories, the tool automatically enhances the prompt to include branch creation and PR creation instructions. The Cursor agent can execute git commands directly. Runs in a persistent terminal session (requires terminal skill).",
      inputSchema: z.object({
        goal: z
          .string()
          .min(5)
          .describe(
            "Detailed task prompt for the Cursor agent. Include: (1) specific files/functions to modify, (2) acceptance criteria. For coding tasks in git repositories, the tool will automatically add instructions to create a branch, commit, push, and create a PR. You don't need to include these git workflow steps manually. Example: 'In src/utils/auth.ts, refactor the login function to use async/await instead of Promise chains. Ensure all existing tests pass.'",
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
      }),
      execute: async (args: {
        goal: string;
        cwd?: string;
        waitSeconds?: number;
        sessionName?: string;
      }, context?: any) => {
        const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
        const waitSeconds = args.waitSeconds ?? DEFAULT_WAIT_SECONDS;
        const sessionName = args.sessionName ?? DEFAULT_SESSION;
        const onProgress = context?.onProgress;

        // Enhance prompt with git workflow instructions for coding tasks
        const enhancedGoal = enhancePromptForCodingTask(args.goal, cwd);
        
        if (enhancedGoal !== args.goal && onProgress) {
          onProgress({
            kind: "status",
            phase: "preparing",
            message: "Enhanced prompt with git workflow instructions",
            data: { originalLength: args.goal.length, enhancedLength: enhancedGoal.length },
          });
        }

        try {
          const { output, completed, elapsed } = runInTmux(
            enhancedGoal,
            cwd,
            waitSeconds,
            sessionName,
            onProgress,
          );

          const outputTail = getTailLines(output);

          const status = completed ? "completed" : "timed_out";
          const summary = [
            `status=${status}`,
            `cwd=${cwd}`,
            `elapsed=${elapsed}s`,
            `session=${safeSession(sessionName)}`,
          ].join(" | ");

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
            ...(completed ? {} : {
              error: `Agent did not complete within ${waitSeconds}s (may still be running).`,
              hint: "Check with terminal_list or increase waitSeconds.",
            }),
          };
        } catch (err: any) {
          return {
            ok: false,
            status: "error",
            error: err?.message || String(err),
            cwd,
            sessionName: safeSession(sessionName),
            hint: "Ensure the terminal backend is available (terminal_check) and Cursor CLI is in PATH (agent --version).",
          };
        }
      },
    },
  };
}
