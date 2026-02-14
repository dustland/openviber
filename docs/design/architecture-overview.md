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
    Gateway[Gateway\nsrc/gateway + src/channels]
    Daemon[Daemon Runtime\nsrc/daemon]
    Viber[Viber Core\nsrc/viber]
    Tools[Tools + Skills\nsrc/tools + src/skills]
    State[(~/.openviber)]
    Spaces[(workspace repos / files)]

    User --> Web
    Web <--> Gateway
    Gateway <--> Daemon
    Daemon --> Viber
    Viber --> Tools
    Daemon <--> State
    Tools <--> Spaces
```

## Layer boundaries (summary)

- `web/`: UI only; communicates via API/WebSocket boundaries.
- `src/channels` and `src/gateway`: transport adapters and routing.
- `src/daemon`: orchestration, task lifecycle, and runtime coordination.
- `src/viber`: planning/execution behavior and agent-level loop.
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
