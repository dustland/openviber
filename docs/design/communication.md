---
title: "Communication"
description: "Message contracts for task execution, reporting, and intervention"
---

# Communication

Communication in OpenViber serves three needs:

1. manager assigns or adjusts work,
2. viber reports progress and asks decisions,
3. manager observes and intervenes in runtime (especially terminals).

## 1. Principles

- **Workspace-first**: messages are transport; durable context lives in `~/.openviber/`.
- **Evidence-carrying**: claims should include refs to artifacts/logs/screens.
- **Decision-friendly**: escalations should prefer multiple-choice questions.

## 2. Core task messages

Board -> daemon:

- `task:submit` (`goal`, `messages`, optional `plan/artifacts/memory`)
- `task:stop`
- `task:message` (manager follow-up / intervention text)

Daemon -> Board:

- `task:started`
- `task:progress` (optional periodic updates)
- `task:completed` (`summary`, `artifactRefs`, `verificationRefs`)
- `task:error`

## 3. Runtime observability messages (tmux)

- `terminal:list`
- `terminal:attach`
- `terminal:output`
- `terminal:input`
- `terminal:resize`
- `terminal:detach`

These expose execution state without requiring GUI remoting.

## 4. Reporting envelope

Long-running work should emit structured periodic status:

- objective completed,
- active plan item,
- blockers/decisions needed,
- budget used vs limit,
- evidence refs.

## 5. Escalation format

When viber needs manager input, send:

- one concise question,
- 2-3 options with tradeoffs,
- a recommended option first.

This keeps intervention low-friction and manager-time efficient.

---

## 6. Channels

Channels are transport surfaces between a manager and one or more vibers.
They should not be the source of truth for work context; workspace files under `~/.openviber/` are.

### Channel Goals

- Deliver instructions to vibers
- Deliver periodic progress reports
- Deliver escalation questions
- Allow manager intervention quickly

### Supported Interaction Styles

| Style | Purpose |
|-------|---------|
| **Interactive chat** (primary) | Assign, redirect, approve, stop |
| **Email reports** (periodic) | Daily/weekly summaries and blockers |
| **Board web UI** | Task/terminal visibility and artifact browsing |

### Behavioral Rules

- Channel switch must not lose context (context comes from workspace)
- Reports should include evidence refs, not only narrative summaries
- Feedback requests should default to multiple-choice options

### Status Reporting Contract

Every periodic update should include:

- Objective progress
- Current plan pointer
- Blockers requiring human input
- Budget usage and runway
- Link/refs to proof (terminal snippets, artifact paths, screenshots)

