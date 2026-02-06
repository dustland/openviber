---
title: "Introduction"
description: "What is OpenViber and how to get started"
---

# Introduction

**OpenViber** is an open-source Cowork Agent platform that turns your machine into an AI teammate. Unlike cloud-based agent frameworks, OpenViber runs locally with full privacy, connects to your enterprise channels, and works autonomously on real tasks.

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

### 3. Enterprise Channels

Connect to DingTalk or WeCom for team collaboration:

```bash
openviber gateway
```

## Key Concepts

| Concept | What It Is |
|---------|------------|
| **Viber** | Your machine + OpenViber = an AI teammate |
| **Agent** | The AI that reasons, plans, and executes tasks |
| **Tools** | Actions the agent can take (file, search, web, browser, desktop, etc.) |
| **Skills** | Domain knowledge injected as instructions |
| **Jobs** | Scheduled tasks defined in YAML |

## Working Modes

OpenViber supports three levels of autonomy:

| Mode | Behavior |
|------|----------|
| **Always Ask** | Agent asks before each action — you approve everything |
| **Agent Decides** | Agent acts within policy, escalates risky actions |
| **Always Execute** | Maximum autonomy, intervene by exception |

Start with "Always Ask" and gradually increase autonomy as you build trust.

## Next Steps

1. **[Quick Start](/docs/getting-started/quick-start)** — Run your first agent in minutes
2. **[Agents](/docs/concepts/agents)** — Configure agent behavior
3. **[Jobs](/docs/concepts/jobs)** — Set up scheduled tasks
4. **[Tools](/docs/concepts/tools)** — Available actions
5. **[Skills](/docs/concepts/skills)** — Add domain knowledge
