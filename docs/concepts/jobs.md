# Jobs

Jobs are scheduled tasks that run automatically on a timer. They let OpenViber perform recurring work without manual intervention.

## What Are Jobs?

A **Job** is a YAML file that defines:

- A cron schedule (when to run)
- A prompt (what to do)
- Optional agent configuration (model, skills, tools)

Jobs are stored per-viber in `~/.openviber/vibers/{id}/jobs/` and are loaded automatically when OpenViber starts.

## Example Job

```yaml
name: Daily Summary
description: Summarize GitHub activity every morning
schedule: "0 9 * * *"
provider: openrouter
model: deepseek/deepseek-chat
skills:
  - github
prompt: |
  Summarize my GitHub notifications from the last 24 hours.
  List any PRs that need my review.
```

## Job Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable job name |
| `description` | No | What the job does |
| `schedule` | Yes | Cron expression (see below) |
| `provider` | No | LLM provider (default: openrouter) |
| `model` | No | Model to use |
| `skills` | No | Skills to enable |
| `tools` | No | Additional tools |
| `prompt` | Yes | The task for the agent |

## Schedule Format

Jobs use standard cron syntax with optional seconds:

| Expression | Meaning |
|------------|---------|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 */6 * * *` | Every 6 hours |
| `0 0 * * 1` | Every Monday at midnight |
| `*/30 * * * *` | Every 30 minutes |
| `*/3 * * * * *` | Every 3 seconds (6-field format) |

## Use Cases

| Job Type | Example |
|----------|---------|
| Monitoring | Check system health and alert on issues |
| Reporting | Generate daily status summaries |
| Automation | Clean up old files weekly |
| Integration | Sync data between services |

## Jobs Location

Jobs are viber-scoped — each viber has its own scheduled tasks:

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

Jobs are loaded when `openviber start` runs. Changes to job files require a restart.
