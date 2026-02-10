/**
 * Job Stories — pre-built configurations users can pick when creating a job.
 * Derived from examples/jobs/*.yaml
 */

import type { TemplateParam } from "$lib/data/template-utils";

export interface JobTemplate {
  id: string;
  label: string;
  description: string;
  /** Lucide icon name hint (rendered by the consumer) */
  icon: "file-plus" | "heart-pulse" | "users" | "sparkles";
  promptTemplate?: string;
  params?: TemplateParam[];
  defaults: {
    name?: string;
    prompt?: string;
    description?: string;
    /** Raw cron expression */
    schedule?: string;
    scheduleMode?: "daily" | "interval";
    dailyHour?: number;
    dailyMinute?: number;
    intervalHours?: number;
    intervalDailyHour?: number;
    selectedDays?: boolean[];
    model?: string;
    skills?: string[];
    tools?: string[];
  };
}

const PRIMARY_TOOL_OPTIONS = [
  { value: "cursor-agent", label: "Cursor Agent CLI" },
  { value: "codex-cli", label: "Codex CLI" },
  { value: "gemini-cli", label: "Gemini CLI" },
];

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: "blank",
    label: "Blank",
    description: "Start from scratch",
    icon: "file-plus",
    defaults: {},
  },
  {
    id: "health-monitor",
    label: "Health Monitor",
    description: "Periodically check a service and auto-recover from errors",
    icon: "heart-pulse",
    defaults: {
      name: "Health Monitor",
      description: "Monitors and auto-recovers service errors",
      schedule: "*/3 * * * * *",
      scheduleMode: "interval",
      model: "deepseek/deepseek-chat",
      skills: ["antigravity"],
      tools: ["browser"],
      prompt: `You are an automated health monitor.

Call \`antigravity_check_and_heal\` to scan for errors and auto-recover.
Report the status briefly.`,
    },
  },
  {
    id: "team-coworker",
    label: "Team Coworker",
    description: "A planner agent that delegates desktop tasks to a worker",
    icon: "users",
    defaults: {
      name: "Team Coworker",
      description: "A team where a planner delegates tasks to a desktop worker",
      schedule: "0/30 * * * * *",
      scheduleMode: "interval",
      model: "openai/gpt-4o-mini",
      skills: [],
      tools: ["desktop"],
      prompt: `You are the Planner. You have a colleague named "DesktopBot".

Your Goal: Open "TextEdit" and write a greeting message to the user.

1. Plan the steps required.
2. Delegate the execution to "DesktopBot" by instructing them clearly.

Since we are testing single-agent skills first:
ACT AS "DesktopBot" yourself for this demo.

1. Open application "TextEdit"
2. Type "Hello! I am your AI Co-worker living on your desktop."`,
    },
  },
  {
    id: "gemini-coder",
    label: "Gemini Coder",
    description: "Use Gemini CLI to autonomously code and fix issues",
    icon: "sparkles",
    defaults: {
      name: "Gemini Coder",
      description: "Autonomous coding agent powered by Gemini CLI",
      schedule: "0 9 * * *",
      scheduleMode: "daily",
      model: "google/gemini-2.5-pro",
      skills: ["gemini-cli"],
      tools: [],
      prompt: `You have the Gemini CLI skill available via \`gemini_run\`.

Use it to review the current project, identify issues or improvements, and apply fixes autonomously.

Steps:
1. Call \`gemini_run\` with a clear task description.
2. Review the output summary and tail logs.
3. Report what was done and any issues encountered.`,
    },
  },
  {
    id: "all-day-improvement",
    label: "All-Day Improvement Loop",
    description: "Continuously improve a repo using GitHub, Gmail, and Railway",
    icon: "sparkles",
    promptTemplate: `You are an all-day continuous improvement agent for {{targetRepo}}.
Primary AI coding tool: {{primaryTool}}

On each run:
1. GitHub: scan open issues and recent activity; identify high-signal items to address.
2. Gmail: search for urgent product/support emails related to the repo; read the top matches.
3. Railway: check deployment status and recent logs for regressions or failures.
4. If a small, safe fix is clear, use the {{primaryTool}} skill to implement it, commit, and open a PR.
5. If no safe fix is available, log findings and create a tracking issue if needed.

Guardrails:
- Keep changes scoped and low-risk.
- Avoid breaking API changes.
- Always include a brief summary of actions and next steps.`,
    params: [
      {
        id: "targetRepo",
        label: "Target GitHub repo",
        description: "Owner/name or full GitHub URL",
        type: "text",
        required: true,
        placeholder: "acme/website",
      },
      {
        id: "primaryTool",
        label: "Primary AI coding tool",
        type: "select",
        options: PRIMARY_TOOL_OPTIONS,
        defaultValue: "cursor-agent",
      },
    ],
    defaults: {
      name: "All-Day Improvement Loop",
      description: "Continuously improve a repo from GitHub, Gmail, and Railway",
      scheduleMode: "interval",
      intervalHours: 2,
      model: "openai/gpt-4o",
      skills: ["github", "gmail", "railway", "{{primaryTool}}"],
      tools: [],
    },
  },
];
