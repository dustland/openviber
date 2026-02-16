import { z } from "zod";
import { execSync } from "child_process";
import * as path from "path";
import * as os from "os";

/**
 * Run a gh CLI command and return parsed JSON output.
 */
function ghExec(args: string, cwd?: string): string {
  return execSync(`gh ${args}`, {
    encoding: "utf8",
    stdio: "pipe",
    cwd: cwd || process.cwd(),
    timeout: 30000,
  }).trim();
}

/**
 * Run a git command.
 */
function gitExec(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    stdio: "pipe",
    cwd,
    timeout: 30000,
  }).trim();
}

/**
 * Base directory for cloned repos — must match runtime environment prompt (~/openviber_spaces).
 */
const OPENVIBER_SPACES = "openviber_spaces";

/**
 * Get the local path for a repo and ensure parent dir exists. Uses ~/openviber_spaces/owner/repo
 * so clones match the path the daemon runtime tells the agent to use.
 */
function getCloneTargetDir(repo: string): string {
  const parts = repo.split("/").filter(Boolean);
  const org = parts[0] ?? "unknown";
  const repoName = parts[1] ?? repo;
  const dir = path.join(os.homedir(), OPENVIBER_SPACES, org, repoName);
  execSync(`mkdir -p "${path.join(os.homedir(), OPENVIBER_SPACES, org)}"`, {
    encoding: "utf8",
  });
  return dir;
}

export function getTools(): Record<string, import("../worker/tool").CoreTool> {
  return {
    gh_list_issues: {
      description:
        "List open issues for a GitHub repository. Call when the user asks to check issues, find bugs to fix, or as the first step in an automated issue-fixing workflow. Returns issue numbers, titles, labels, and URLs.",
      inputSchema: z.object({
        repo: z
          .string()
          .describe(
            "Repository in owner/name format (e.g. 'dustland/openviber')",
          ),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of issues to return (default: 10)"),
        labels: z
          .string()
          .optional()
          .describe(
            "Filter by label (e.g. 'bug' or 'good first issue')",
          ),
      }),
      execute: async (args: {
        repo: string;
        limit?: number;
        labels?: string;
      }) => {
        try {
          const limit = args.limit ?? 10;
          let cmd = `issue list --repo ${args.repo} --state open --limit ${limit} --json number,title,labels,url,body,createdAt`;
          if (args.labels) {
            cmd += ` --label "${args.labels}"`;
          }
          const raw = ghExec(cmd);
          const issues = JSON.parse(raw);
          return {
            ok: true,
            count: issues.length,
            issues: issues.map((i: any) => ({
              number: i.number,
              title: i.title,
              labels: i.labels?.map((l: any) => l.name) || [],
              url: i.url,
              body: i.body?.slice(0, 500) || "",
              createdAt: i.createdAt,
            })),
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    },

    gh_get_issue: {
      description:
        "Get full details of a specific GitHub issue. Use after gh_list_issues to read the full issue body, comments, and labels before fixing it.",
      inputSchema: z.object({
        repo: z
          .string()
          .describe("Repository in owner/name format"),
        issueNumber: z.number().describe("Issue number"),
      }),
      execute: async (args: { repo: string; issueNumber: number }) => {
        try {
          const raw = ghExec(
            `issue view ${args.issueNumber} --repo ${args.repo} --json number,title,body,labels,comments,url,state`,
          );
          const issue = JSON.parse(raw);
          return {
            ok: true,
            issue: {
              number: issue.number,
              title: issue.title,
              body: issue.body || "",
              labels: issue.labels?.map((l: any) => l.name) || [],
              state: issue.state,
              url: issue.url,
              comments: issue.comments?.map((c: any) => ({
                author: c.author?.login || "unknown",
                body: c.body?.slice(0, 300) || "",
              })) || [],
            },
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    },

    gh_clone_repo: {
      description:
        "Clone a GitHub repository into ~/openviber_spaces/owner/repo (OpenViber working directory). Use to get a local copy of a repo before fixing issues. Path matches the environment project path the viber is given. Returns the local path.",
      inputSchema: z.object({
        repo: z
          .string()
          .describe("Repository in owner/name format (e.g. 'dustland/openviber')"),
        branch: z
          .string()
          .optional()
          .describe("Branch to clone (default: default branch)"),
      }),
      execute: async (args: { repo: string; branch?: string }) => {
        try {
          const localPath = getCloneTargetDir(args.repo);

          // Check if already cloned
          try {
            gitExec("rev-parse --git-dir", localPath);
            // Already cloned, just pull latest
            gitExec("pull --ff-only", localPath);
            return {
              ok: true,
              path: localPath,
              message: `Repository already cloned. Pulled latest changes.`,
              alreadyCloned: true,
            };
          } catch {
            // Not cloned yet, clone it
          }

          let cloneCmd = `repo clone ${args.repo} "${localPath}"`;
          if (args.branch) {
            cloneCmd += ` -- --branch ${args.branch}`;
          }
          ghExec(cloneCmd);
          return {
            ok: true,
            path: localPath,
            message: `Cloned ${args.repo} to ${localPath}`,
            alreadyCloned: false,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    },

    gh_create_branch: {
      description:
        "Create and checkout a new git branch in a local repository. Use after cloning to create a fix branch (e.g. 'fix/issue-123').",
      inputSchema: z.object({
        cwd: z
          .string()
          .describe("Path to the local git repository"),
        branchName: z
          .string()
          .describe("Name for the new branch (e.g. 'fix/issue-123')"),
        baseBranch: z
          .string()
          .optional()
          .describe("Base branch to create from (default: current branch)"),
      }),
      execute: async (args: {
        cwd: string;
        branchName: string;
        baseBranch?: string;
      }) => {
        try {
          const cwd = path.resolve(args.cwd);

          // Ensure we're on the base branch if specified
          if (args.baseBranch) {
            gitExec(`checkout ${args.baseBranch}`, cwd);
            gitExec("pull --ff-only", cwd);
          }

          // Create and checkout new branch
          gitExec(`checkout -b ${args.branchName}`, cwd);

          return {
            ok: true,
            branch: args.branchName,
            cwd,
            message: `Created and switched to branch '${args.branchName}'`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    },

    gh_commit_and_push: {
      description:
        "Stage all changes, commit with a message, and push to the remote. Use after Codex has made changes to commit and push the fix.",
      inputSchema: z.object({
        cwd: z.string().describe("Path to the local git repository"),
        message: z
          .string()
          .describe(
            "Commit message (e.g. 'fix: resolve null pointer in user service (#123)')",
          ),
      }),
      execute: async (args: { cwd: string; message: string }) => {
        try {
          const cwd = path.resolve(args.cwd);

          // Stage all changes
          gitExec("add -A", cwd);

          // Check if there are changes to commit
          try {
            gitExec("diff --cached --quiet", cwd);
            return {
              ok: false,
              error: "No changes to commit",
            };
          } catch {
            // diff --quiet exits with 1 when there are changes — this is expected
          }

          // Commit
          gitExec(`commit -m ${JSON.stringify(args.message)}`, cwd);

          // Push (set upstream on first push)
          const branch = gitExec("rev-parse --abbrev-ref HEAD", cwd);
          try {
            gitExec(`push -u origin ${branch}`, cwd);
          } catch {
            // If push fails, try force push (for rebased branches)
            gitExec(`push -u origin ${branch} --force-with-lease`, cwd);
          }

          return {
            ok: true,
            branch,
            message: `Committed and pushed: ${args.message}`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    },

    gh_create_pr: {
      description:
        "Create a pull request on GitHub from the current branch. Use after committing and pushing the fix. Can reference an issue number.",
      inputSchema: z.object({
        cwd: z.string().describe("Path to the local git repository"),
        title: z.string().describe("PR title"),
        body: z
          .string()
          .optional()
          .describe(
            "PR body/description (supports markdown). Include 'Fixes #123' to auto-close the issue.",
          ),
        baseBranch: z
          .string()
          .optional()
          .describe("Target branch for the PR (default: repo default branch)"),
      }),
      execute: async (args: {
        cwd: string;
        title: string;
        body?: string;
        baseBranch?: string;
      }) => {
        try {
          const cwd = path.resolve(args.cwd);
          let cmd = `pr create --title ${JSON.stringify(args.title)}`;
          if (args.body) {
            cmd += ` --body ${JSON.stringify(args.body)}`;
          }
          if (args.baseBranch) {
            cmd += ` --base ${args.baseBranch}`;
          }
          const raw = ghExec(cmd, cwd);

          // gh pr create returns the PR URL
          return {
            ok: true,
            url: raw,
            message: `Pull request created: ${raw}`,
          };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    },
  };
}
