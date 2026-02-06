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

## 3. Runtime observability messages (tmux-first, multi-app ready)

- `terminal:list` (returns `apps[]`, `sessions[]`, `panes[]`)
- `terminal:attach` (`target`, optional `appId`)
- `terminal:output` (`target`, optional `appId`, `data`)
- `terminal:input` (`target`, optional `appId`, `keys`)
- `terminal:resize` (`target`, optional `appId`, `cols`, `rows`)
- `terminal:detach` (`target`, optional `appId`)

`tmux` is the default primary runtime. `appId` enables incremental support for other terminal-capable runtimes while preserving the same board contract.

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

---

## 7. Queueing and retries (reliable message delivery)

The messaging layer should enforce two critical behaviors:

1. **Lane-aware queueing** to prevent overlapping runs per session.
2. **Provider-aware retries** that avoid duplicating non-idempotent work.

### Queueing (per-session lanes)

- Incoming messages are serialized per session key to avoid concurrent tool runs colliding with shared files, terminals, or rate limits.
- A global concurrency cap limits overall parallelism (per-host).
- Queue modes should be configurable per channel:
  - **collect** (default): coalesce multiple inbound messages into one follow-up turn.
  - **steer**: inject into the current run at the next safe boundary (tool boundary).
  - **followup**: wait until the current run ends.
  - **steer-backlog**: steer now and still enqueue for a follow-up turn.
- Queue options should include debounce, cap, and overflow policy (drop-old, drop-new, summarize).

### Retry policy (per provider)

- Retries happen per HTTP request (not full multi-step flows).
- Use idempotency keys for side effects (send, agent run) so retries are safe.
- Respect provider-specific retry-after headers and minimum delays.
- Non-retriable errors (e.g., malformed Markdown) should fall back to a safer mode.

---

## 8. Usage tracking (budget visibility)

For cost-aware autonomy, include provider usage snapshots when available:

- **Status surfaces** (e.g., Board status panel) should show tokens used + cost estimate.
- **Per-response footers** should be optional (/usage tokens|full).
- **Provider-native usage** should be preferred over estimated costs when credentials allow.
