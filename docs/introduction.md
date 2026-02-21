---
title: "Introduction"
description: "You Imagine It. Tasks Build It."
---

# Introduction

**You Imagine It. Tasks Build It.**

**OpenViber** is an open-source platform that turns your machine into a **Viber** — a runtime that executes autonomous AI tasks. You describe what you want, and the Viber handles the work autonomously. Runs locally with full privacy, connects to your channels, and works while you sleep.

The CLI is available as both `openviber` and the shorter alias `viber` (when installed).

## What Can OpenViber Do?

| Task Type | Example |
|-----------|---------|
| **Development** | "Build a landing page with dark theme" |
| **Research** | "Summarize the latest AI trends and write a report" |
| **Automation** | "Check GitHub notifications every morning and summarize" |
| **Maintenance** | "Monitor IDE status and auto-recover if errors found" |

OpenViber handles tasks that require multiple steps, file operations, web browsing, and coordination — not just chat.

## How Do You Interact With It?

### 1. Viber Board (Web UI)

Open the browser-based interface to chat with your task:

```bash
# Start the full stack (Gateway, Viber, and Web UI)
pnpm dev
# Open http://localhost:6006
```

### 2. Command Line

Run one-off tasks or interact via terminal:

```bash
# Start a task (on your local Viber)
openviber run "Create a README for this project"

# Interactive terminal chat (tmux-friendly)
openviber chat
```

### 3. Enterprise Channels

Connect to DingTalk or WeCom for team collaboration:

```bash
# Start the enterprise channel server
openviber channels
```

> **Note:** Requires configuration of API keys in environment variables. See documentation for details.

## Key Concepts

| Concept | What It Is |
|---------|------------|
| **Viber** | Your machine running the OpenViber daemon — executes tasks |
| **Task** | A role-scoped unit of work assigned to a Viber |
| **Tools** | Actions the Viber can take (file, search, web, browser, desktop, schedule, notify) |
| **Skills** | Domain knowledge bundles (`SKILL.md` + optional tools) — antigravity, cursor-agent, codex-cli, github, terminal |
| **Jobs** | Cron-scheduled tasks that run tasks autonomously on a timer |

## Working Modes

OpenViber supports three levels of autonomy:

| Mode | Behavior |
|------|----------|
| **Always Ask** | Task asks before each action — you approve everything |
| **Agent Decides** | Task acts within policy, escalates risky actions |
| **Always Execute** | Maximum autonomy, intervene by exception |

Start with "Always Ask" and gradually increase autonomy as you build trust.

## Next Steps

1. **[Quick Start](/docs/getting-started/quick-start)** — Run your first task in minutes
2. **[Viber Runtime](/docs/concepts/viber)** — Configure task behavior on your machine
3. **[Jobs](/docs/concepts/jobs)** — Set up scheduled tasks
4. **[Tools](/docs/concepts/tools)** — Available actions
5. **[Skills](/docs/concepts/skills)** — Add domain knowledge
