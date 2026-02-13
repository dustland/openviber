---
title: "Jobs"
description: "Scheduled tasks that run automatically on a timer"
---

# Jobs

**Jobs** are scheduled tasks that run automatically on a cron timer. They let OpenViber perform recurring work — monitoring, reporting, automation — without manual intervention.

## What Are Jobs?

A job is a YAML file that defines:

- **When** to run (cron schedule)
- **What** to do (a prompt for the task)
- **How** to do it (model, skills, tools configuration)

Jobs are the bridge between "set it up once" and "it runs forever." Combined with skills, they enable powerful autonomous workflows like health monitoring, daily summaries, and automated issue fixing.

## How Jobs Work

### Lifecycle

1. **Definition** — You create a YAML file in the jobs directory (or use the `create_scheduled_job` tool via chat)
2. **Loading** — The `JobScheduler` reads all `.yaml`/`.yml` files from the jobs directory at startup
3. **Scheduling** — Each job's cron expression is registered with the [Croner](https://github.com/hexagon/croner) scheduler
4. **Execution** — When the cron fires, the scheduler creates a `Task` with the job's configuration and runs the prompt
5. **Logging** — Results (tool outputs, LLM responses) are logged to the console; healthy/routine results are suppressed for noise reduction

### Execution Model

When a job fires, the scheduler:

1. Creates a fresh `Task` instance with the job's `model`, `skills`, and `tools`
2. Sends the job's `prompt` as a user message
3. The task reasons, calls tools (including skill-provided tools), and generates a response
4. Tool results and the task's text response are logged
5. Routine "healthy" results (e.g., `status: HEALTHY` from antigravity) are automatically suppressed from logs

If no `model` is specified, the job is skipped with a warning — a model is required for execution.

## Job Configuration

### Full Schema

```yaml
# ~/.openviber/vibers/dev/jobs/daily-summary.yaml

name: Daily Summary
description: Summarize GitHub activity every morning
schedule: "0 9 * * *"
provider: openrouter
model: deepseek/deepseek-chat
skills:
  - github
tools: []
prompt: |
  Summarize my GitHub notifications from the last 24 hours.
  List any PRs that need my review.
```

### Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | Yes | — | Human-readable job name (used in logs) |
| `description` | No | — | What the job does |
| `schedule` | Yes | — | Cron expression (5 or 6 fields) |
| `provider` | No | `openrouter` | LLM provider |
| `model` | Yes* | — | Model to use (e.g., `deepseek/deepseek-chat`) |
| `skills` | No | `[]` | Skills to enable for this job |
| `tools` | No | `[]` | Additional tools to enable |
| `prompt` | Yes | — | The instruction for the task |
| `nodeId` | No | — | Target a specific Viber (for gateway/Board-pushed jobs) |

*Jobs without a `model` field are skipped at execution time.

## Schedule Format

Jobs use standard cron syntax. Both 5-field (minute-level) and 6-field (second-level) formats are supported:

### 5-Field (Standard Cron)

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

### 6-Field (With Seconds)

```
┌───────────── second (0-59)
│ ┌───────────── minute (0-59)
│ │ ┌───────────── hour (0-23)
│ │ │ ┌───────────── day of month (1-31)
│ │ │ │ ┌───────────── month (1-12)
│ │ │ │ │ ┌───────────── day of week (0-6, Sun=0)
│ │ │ │ │ │
* * * * * *
```

### Common Examples

| Expression | Meaning |
|------------|---------|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 */6 * * *` | Every 6 hours |
| `0 0 * * 1` | Every Monday at midnight |
| `*/30 * * * *` | Every 30 minutes |
| `0 */4 * * *` | Every 4 hours |
| `*/3 * * * * *` | Every 3 seconds (6-field) |
| `0 8,12,18 * * *` | At 8 AM, 12 PM, and 6 PM |

## Job Locations

Jobs can be stored in two places:

### Per-Task Jobs

Each task has its own job directory:

```
~/.openviber/vibers/
├── dev/
│   └── jobs/
│       ├── daily-summary.yaml
│       └── health-check.yaml
└── researcher/
    └── jobs/
        └── weekly-report.yaml
```

Per-task jobs are loaded when the task starts. They inherit the task's context and run in its scope.

### Global Jobs

Shared jobs that aren't tied to a specific task:

```
~/.openviber/jobs/
├── morning-standup.yaml
└── system-health.yaml
```

The global jobs directory is configurable via the `OPENVIBER_JOBS_DIR` environment variable. Global jobs are used by the schedule tool and the daemon scheduler.

### Disabling a Job

To disable a job without deleting it, include `.disabled` in the filename:

```
daily-summary.disabled.yaml
```

Disabled jobs are skipped during loading.

## Creating Jobs

### Method 1: YAML File (Manual)

Create a `.yaml` file in the appropriate jobs directory:

```yaml
# ~/.openviber/jobs/check-health.yaml
name: Health Check
description: Monitor Antigravity IDE and auto-recover
schedule: "*/3 * * * * *"
provider: openrouter
model: deepseek/deepseek-chat
skills:
  - antigravity
prompt: Check Antigravity IDE health and auto-recover if needed.
```

### Method 2: Chat (Natural Language)

Use the `create_scheduled_job` tool through chat:

> "Schedule a job to check my GitHub notifications at 8am every day"

The tool accepts natural language schedules and converts them to cron:

| Natural Language | Cron Expression |
|-----------------|-----------------|
| "8am daily" | `0 8 * * *` |
| "every hour" | `0 * * * *` |
| "every 30 minutes" | `*/30 * * * *` |
| "Monday 9am" | `0 9 * * 1` |
| "every 3 seconds" | `*/3 * * * * *` |
| "8:30pm every day" | `30 20 * * *` |

### Method 3: Gateway (Remote)

Jobs can be pushed from the OpenViber Board to a connected Viber via the `job:create` WebSocket message. The gateway sends the job configuration and the Viber writes it to disk, then triggers a scheduler reload.

## Schedule Tools

OpenViber provides three built-in tools for managing jobs from chat:

| Tool | Description |
|------|-------------|
| `create_scheduled_job` | Create a new job with natural language scheduling |
| `list_scheduled_jobs` | List all jobs and their schedules |
| `delete_scheduled_job` | Delete a job by name |

These tools operate on the global jobs directory (`~/.openviber/jobs/`).

### Example Chat Workflow

```
You:   "Create a job called 'morning-brief' that runs at 8am daily
        and summarizes my GitHub notifications"

Task:  Created job "morning-brief" — will run at schedule: 0 8 * * *
       Job saved to ~/.openviber/jobs/morning-brief.yaml
       Restart OpenViber to load the new job.

You:   "List my scheduled jobs"

Task:  You have 2 scheduled jobs:
       1. morning-brief — 0 8 * * * — "Summarize my GitHub notifications..."
       2. health-check — */3 * * * * * — "Check Antigravity IDE health..."
```

## Example Jobs

### IDE Health Monitor

Runs every 3 seconds to detect and auto-recover from IDE errors:

```yaml
name: Antigravity Health Check
schedule: "*/3 * * * * *"
model: deepseek/deepseek-chat
skills:
  - antigravity
prompt: Check Antigravity IDE health and auto-recover if needed.
```

### Daily GitHub Summary

Runs every weekday morning to summarize GitHub activity:

```yaml
name: Morning Standup
description: Daily GitHub activity summary
schedule: "0 9 * * 1-5"
provider: openrouter
model: deepseek/deepseek-chat
skills:
  - github
prompt: |
  Summarize my GitHub notifications from the last 24 hours.
  List any PRs that need my review.
  Flag any issues assigned to me that are overdue.
```

### Weekly Code Review

Runs every Monday to scan for code quality issues:

```yaml
name: Weekly Code Review
description: Automated code quality scan
schedule: "0 10 * * 1"
provider: openrouter
model: anthropic/claude-sonnet-4-20250514
skills:
  - codex-cli
  - github
prompt: |
  Review the main branch of dustland/openviber for:
  - Unused imports and dead code
  - Missing error handling
  - TypeScript type safety issues
  Create an issue if you find significant problems.
```

### Automated Issue Fixer

Runs every 6 hours to check for and fix simple issues:

```yaml
name: Auto Fix Issues
description: Find and fix labeled issues automatically
schedule: "0 */6 * * *"
provider: openrouter
model: anthropic/claude-sonnet-4-20250514
skills:
  - github
  - codex-cli
prompt: |
  Check dustland/openviber for issues labeled "good first issue".
  Pick the most recent one and attempt to fix it.
  Create a PR with the fix.
```

## Scheduler Internals

The `JobScheduler` class (in `src/daemon/scheduler.ts`) manages the cron lifecycle:

- **`start()`** — Load jobs from disk and register cron triggers
- **`stop()`** — Cancel all active cron jobs
- **`reload()`** — Stop all jobs and re-scan the directory (used after the gateway pushes a new job from the Board)

The scheduler uses [Croner](https://github.com/hexagon/croner) for cron parsing and scheduling. Croner supports both standard 5-field cron and 6-field cron with seconds.

### Reloading

Changes to job files require either:
- Restarting OpenViber (`openviber start`)
- A gateway-triggered reload (when a job is pushed from the Viber Board)

Hot-reloading of job files is planned but not yet implemented.

## Next Steps

- [Skills](/docs/concepts/skills) — Domain knowledge for job tasks
- [Tools](/docs/concepts/tools) — Actions available to jobs
- [Viber](/docs/concepts/viber) — Viber configuration and working modes
- [Config Schema](/docs/reference/config-schema) — Full YAML schema reference
- [Task Lifecycle](/docs/design/task-lifecycle) — How tasks (including job-triggered tasks) flow through the system
