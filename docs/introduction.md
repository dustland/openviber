---
title: "Introduction"
description: "You Imagine. Vibers Build."
---

# Introduction

**You Imagine. Vibers Build.**

**OpenViber** is an open-source platform that turns your machine into a **Viber Node** — hosting role-scoped AI workers called **vibers** that handle real tasks autonomously. Runs locally with full privacy, connects to your channels, and works while you sleep.

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

Open the browser-based interface to chat with your viber:

```bash
npx openviber start
# Start the web UI (`pnpm dev:web`) and open http://localhost:6006
```

### 2. Command Line

Run one-off tasks or scheduled jobs:

```bash
# Start a task
openviber run "Create a README for this project"

# Interactive terminal chat (tmux-friendly)
openviber chat

# Run a scheduled job
openviber run jobs/morning-standup.yaml
```

### 3. Enterprise Channels *(Coming Soon)*

Connect to DingTalk or WeCom for team collaboration:

```bash
openviber gateway
```

> **Note:** Enterprise channel integration is planned but not yet available.

## Key Concepts

| Concept | What It Is |
|---------|------------|
| **Viber** | A role-scoped AI worker with its own persona, goals, and tools |
| **Viber Node** | Your machine running OpenViber — hosts one or more vibers |
| **Tools** | Actions vibers can take (file, search, web, browser, desktop, etc.) |
| **Skills** | Domain knowledge injected as instructions |
| **Jobs** | Scheduled tasks defined in YAML |

## Working Modes

OpenViber supports three levels of autonomy:

| Mode | Behavior |
|------|----------|
| **Always Ask** | Viber asks before each action — you approve everything |
| **Viber Decides** | Viber acts within policy, escalates risky actions |
| **Always Execute** | Maximum autonomy, intervene by exception |

Start with "Always Ask" and gradually increase autonomy as you build trust.

## Next Steps

1. **[Quick Start](/docs/getting-started/quick-start)** — Run your first viber in minutes
2. **[Viber](/docs/concepts/viber)** — Configure viber behavior
3. **[Jobs](/docs/concepts/jobs)** — Set up scheduled tasks
4. **[Tools](/docs/concepts/tools)** — Available actions
5. **[Skills](/docs/concepts/skills)** — Add domain knowledge
