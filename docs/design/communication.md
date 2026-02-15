---
title: "Communication"
description: "How operators interact with vibers through the Board, CLI, and channels"
---

# Communication

Communication in OpenViber connects operators to their vibers. The primary interaction surface is the **Viber Board** (web UI), with CLI and enterprise channels as secondary paths.

---

## 1. Interaction Surfaces

| Surface | Transport | Use Case |
|---------|-----------|----------|
| **Viber Board** (web UI) | HTTP + SSE via AI SDK | Primary: chat, observe terminals, manage vibers |
| **CLI** | Direct daemon call | Quick tasks: `openviber run "build the landing page"` |
| **Enterprise channels** | Channel APIs (future) | DingTalk, WeCom, Slack — async task management |

---

## 2. Board Communication Flow

The Viber Board (web app) is a SvelteKit app that communicates with vibers through the gateway:

```
Operator types message
  → @ai-sdk/svelte Chat class sends POST to /api/tasks/[id]/chat
    → SvelteKit API route forwards to gateway: gatewayClient.submitTask()
      → Gateway creates task, sends task:submit to daemon over WebSocket
        → Viber daemon runs AI SDK streamText(), streams response back
      → Gateway relays SSE stream to web app
    → Web app pipes SSE to browser
  → Chat class renders streaming response
```

### Message Persistence

Messages are persisted to SQLite alongside the streaming flow:
- **User message**: Saved to DB before submitting to the gateway.
- **Assistant message**: Saved to DB in the `Chat.onFinish` callback after streaming completes.
- **Task scoping**: Messages are grouped by task ID for conversation continuity.

### Session Continuity

When the operator returns to a viber's chat page:
1. DB messages are loaded and displayed.
2. A new `Chat` instance is created, seeded with DB message history.
3. The next message sent includes the full history, giving the viber conversation context.

---

## 3. Real-Time Observability

### Terminal Streaming

Operators can watch viber terminal sessions in real time:
- Terminal I/O flows over the daemon ↔ gateway WebSocket (separate from the AI stream).
- The Viber Board renders terminal output using xterm.js.
- Operators can send keyboard input to terminals.
- tmux is the default terminal runtime.

### Task Status

The Viber Board polls the gateway for viber status:
- Which vibers are connected.
- Which tasks are running.
- Running task count and uptime.

---

## 4. Intervention

Operators can intervene during task execution:

| Action | How | Effect |
|--------|-----|--------|
| **Send follow-up** | Type a new message during a running task | Message queued for processing after current step |
| **Steer** | Send with `injectionMode: "steer"` | Aborts current AI call, restarts with new context |
| **Stop** | Click stop button | Aborts task entirely |
| **Collect** | Send with `injectionMode: "collect"` | Buffers message, merged into next follow-up turn |

See [task-lifecycle.md](./task-lifecycle.md) for full details on message injection modes.

---

## 5. Escalation Format

When a viber needs operator input, it should present clear choices:

- **One question at a time** (unless tightly coupled).
- **Recommended option first**, clearly marked.
- **Clear tradeoffs** per option.
- **Timeout behavior** — what happens if no response.

This is enforced through the viber's system prompt (personality defined in `soul.md`), not through protocol-level constraints.

---

## 6. Reporting

For long-running or scheduled tasks, vibers should include in their responses:

- **What was done** — actions taken, tools used.
- **Evidence** — terminal output, file paths, screenshots, URLs.
- **Blockers** — anything requiring operator attention.
- **Cost** — tokens used (provided by AI SDK usage tracking).

Reporting cadence is natural to conversation — the viber reports when it has something to report, not on a fixed timer.

---

## 7. Future: Enterprise Channels

Enterprise channel support (DingTalk, WeCom, Slack) will add asynchronous communication:

- **Block streaming** — coalesce tokens into complete message blocks for channels that don't support SSE.
- **Channel adapters** — translate between channel APIs and the gateway's task submission format.
- **Workspace-first** — channels deliver messages, but durable context lives in `~/.openviber/` (see [personalization.md](./personalization.md)).
- **Bidirectional** — operators send tasks via channel; vibers report progress back to the same channel.

The channel layer will sit alongside the Board, not replace it — the Board remains the primary surface for real-time observation.
