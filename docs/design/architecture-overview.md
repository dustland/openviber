---
title: "Architecture Overview"
description: "A concise, visual overview of OpenViber components and boundaries"
---

# OpenViber Architecture Overview

This page is a quick map of the system. For detailed behavior and contracts, follow the links in [Detailed design docs](#detailed-design-docs).

## Runtime topology

```mermaid
flowchart LR
    User[Operator]
    Web[OpenViber Board\nweb/]
    Gateway[Gateway\nsrc/gateway]
    Channels[Channels\nsrc/channels]
    Daemon[Daemon Runtime\nsrc/daemon]
    Worker[Worker Core\nsrc/worker]
    Tools[Tools + Skills\nsrc/tools + src/skills]
    State[(~/.openviber)]
    Spaces[(workspace repos / files)]

    User --> Web
    User --> Channels
    Web <--> Gateway
    Channels <--> Gateway
    Gateway <--> Daemon
    Daemon --> Worker
    Worker --> Tools
    Daemon <--> State
    Tools <--> Spaces
```

## Layer boundaries (summary)

- `web/`: UI only; communicates via API/WebSocket boundaries.
- `src/gateway`: REST API + WebSocket coordinator (modules: `tasks.ts`, `vibers.ts`, `events.ts`).
- `src/channels`: enterprise transport adapters (DingTalk, WeCom).
- `src/daemon`: orchestration, task lifecycle, and runtime coordination.
- `src/worker`: planning/execution behavior and agent-level loop.
- `src/tools` and `src/skills`: capability surfaces used by vibers.
- `~/.openviber`: durable runtime state and personalization.

## Detailed design docs

- `docs/design/viber.md`
- `docs/design/communication.md`
- `docs/design/protocol.md`
- `docs/design/task-lifecycle.md`
- `docs/design/context-management.md`
- `docs/design/memory.md`
- `docs/design/personalization.md`
- `docs/design/mcp-integration.md`
- `docs/design/streaming.md`
- `docs/design/error-handling.md`
- `docs/design/security.md`
- `docs/design/environments-and-tasks.md`
- `docs/design/polyglot-integration-contract.md`
