---
title: "State"
description: OpenViber state model: stateless daemon, context-in/context-out
---

## Overview

OpenViber does not use a framework-managed app store on the daemon path.
There is no required Zustand layer for runtime context.

State is handled through a stateless request contract:

- The client (Viber Board) sends full context on each request.
- The daemon executes and returns one final result.
- The client persists updates and sends them back on the next request.

## Ownership Model

### Viber Board (source of truth)

- Conversation history
- Task/plan documents (for example `task.md`)
- Artifact metadata and refs

### Work machine (`~/.openviber/`)

- Agent configuration files (`~/.openviber/agents/{id}.yaml`)
- Optional local artifacts (`~/.openviber/artifacts/...`)
- Optional workspace files used as context inputs

### Daemon

- Process-stateless between requests
- No conversation/task state store in daemon runtime
- Reads config, runs agent, returns result

## Context-In, Context-Out Pattern

Typical request context:

```json
{
  "goal": "Ship feature X",
  "messages": [...],
  "plan": "markdown or structured plan",
  "artifacts": [{ "id": "design", "ref": "/path/or/url" }]
}
```

Typical final result:

```json
{
  "text": "Completed the task",
  "summary": "What changed",
  "artifactRefs": [{ "id": "report", "ref": "~/.openviber/artifacts/.../report.md" }]
}
```

The client stores this output, updates plan/artifacts if needed, and includes the updated context in the next request.

## UI Framework Choice

If you build a custom UI, use any state library you prefer (or none). That choice is app-level, not part of OpenViber's daemon contract.

## Related Docs

- [Plan and Artifacts](/docs/design/plan-and-artifacts)
- [Viber Daemon](/docs/design/viber-daemon)
