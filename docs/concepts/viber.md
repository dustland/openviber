# Viber

> **You Imagine It. Tasks Build It.**

A **Viber** is your machine running the OpenViber runtime. It is the engine that executes AI **Tasks**.

## How It Works

```mermaid
graph TB
    subgraph node["Viber (your machine)"]
        subgraph openviber["OpenViber runtime"]
            t1["dev-task"]
            t2["researcher-task"]
            t3["pm-task"]
        end
    end
```

Your machine becomes a **Viber** — a runtime that executes one or more **Tasks**. Each task has a distinct role. You talk to them naturally:

```
You:   "Build a landing page for our new product, dark theme"
Viber: I'll create a landing page. Here's my plan:
       1. Scaffold Next.js project
       2. Design hero + feature sections
       3. Deploy to Vercel
       Should I proceed?
You:   "Go ahead"
Viber: On it. You can watch in the terminal panel...
```

## Intent-Driven Creation (Viber Board)

In the web UI, the **New Task** flow is intent-first and environment-aware:

1. Pick an intent template (for example: _Build a Feature_, _Code Review_, _Railway Deploy Failures_)
2. OpenViber pre-fills the task goal from the template
3. OpenViber infers required skills from the intent
4. OpenViber compares required skills against the selected Viber's currently available skills
5. If a required skill is missing, the UI opens a guided prerequisite flow before launch
6. Once required skills are ready, the task auto-launches with the selected intent body

### How Required Skills Are Inferred

OpenViber merges skill requirements from three sources (highest confidence first):

1. `intent.skills` (explicit per-template list)
2. A `skills:` section declared inside the intent body
3. Keyword detection in the intent text (for skill-specific terms)

This gives good defaults for built-in templates while still letting you create precise custom templates.

### Guided Setup Before Launch

When a selected Viber is active but a required skill is not ready, OpenViber starts a proactive setup flow:

- checks Viber availability
- runs skill provisioning for supported skills
- handles auth guidance when the skill needs external login
- retries launch automatically when prerequisites become available

If the Viber is offline, OpenViber asks you to bring it online before launching the task.

### Where to Manage Intents

You can manage built-in and custom intent templates in **Settings → Intents**:

- create and edit custom templates
- replicate built-in templates into editable user templates
- keep intent instructions aligned with your team workflows

## What Makes a Viber

A Viber combines three elements that no chat-only AI has:

| Element                 | What It Gives You                                                            |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Persona & Goals**     | Role focus — configured per-task, allowing the Viber to switch contexts      |
| **Machine Runtime**     | Real execution — terminal, browser, files, apps on your machine              |
| **Identity & Accounts** | Agency — acts on your behalf across GitHub, email, cloud services            |

This is what separates a Viber from a chatbot: it doesn't just answer questions, it **does the work**.

## Working Modes

| Mode               | When to Use                                                    |
| ------------------ | -------------------------------------------------------------- |
| **Always Ask**     | Building trust — task asks before each action                  |
| **Viber Decides**  | Daily work — task acts within policy, escalates risky actions  |
| **Always Execute** | Overnight runs — maximum autonomy, intervene by exception      |

Start with "Always Ask" and graduate to "Viber Decides" as you build confidence.

## You Stay in Control

Your Viber works autonomously but you always have oversight:

- **Observe** — Watch terminal output in real time via tmux streaming
- **Intervene** — Pause, redirect, or stop at any point through chat
- **Approve** — Sensitive actions require explicit permission
- **Audit** — Every action is logged; budget limits prevent runaway costs

## The Viber Runtime

A **Viber** is a single machine running the OpenViber runtime. It provides:

- **Scheduler** — Runs tasks on cron schedules (daily research, weekly reports)
- **Credentials** — Shared account access for all tasks on the Viber
- **Config** — Identity and settings at `~/.openviber/` (lightweight, portable)
- **Spaces** — Working data at `~/openviber_spaces/` (repos, research, outputs)

### Connecting a Viber

From the OpenViber Board, click **Add Viber** to generate a one-liner:

```bash
npx openviber connect --token eyJub2RlIjoiYTFiMmMz...
```

This bootstraps the Viber, creates `~/.openviber/`, and connects to the Board — no inbound ports needed.

Multiple tasks coordinate through **external systems** (GitHub issues, email) rather than talking to each other directly. This keeps everything simple and stateless.

## Next Steps

- [Tools](/docs/concepts/tools) — What tasks can do
- [Skills](/docs/concepts/skills) — Domain knowledge bundles with specialized tools
- [Jobs](/docs/concepts/jobs) — Schedule recurring tasks
- [Memory](/docs/concepts/memory) — How tasks remember context
