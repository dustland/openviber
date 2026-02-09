---
title: "Protocol"
description: "Communication protocol between OpenViber components: hub, node runtime (daemon), and web app"
---

# Protocol

OpenViber's runtime has three components that communicate:

1. **Node runtime (daemon)** — runs on the user's machine, executes AI tasks.
2. **Hub (gateway control plane)** — central coordinator that routes messages between node runtimes and the web app.
3. **Web App** — SvelteKit frontend that operators use to interact with vibers.

Terminology note: in this doc, "daemon" refers to the node runtime process. "Gateway" refers
to the control plane role implemented by the Hub; it is distinct from the enterprise channel
gateway (`viber gateway`).

The protocol is intentionally simple. The AI SDK handles the complex parts (streaming, tool calls, message formatting). OpenViber's protocol is just the plumbing that connects them.

---

## 1. Architecture

```
┌──────────┐   HTTP/SSE   ┌──────────┐   WebSocket   ┌──────────┐    AI SDK    ┌─────┐
│ Browser  │ ←──────────→ │ Web App  │ ←───────────→ │   Hub    │ ←──────────→ │Daemon│
│ (Svelte) │              │(SvelteKit)│               │ (Node)   │              │(Node)│
└──────────┘              └──────────┘               └──────────┘              └──────┘
  @ai-sdk/svelte            API routes                REST + WS             streamText()
  Chat class                hub-client               task routing         toUIMessageStream
```

### Transport Summary

| Path | Transport | Protocol |
|------|-----------|----------|
| Browser ↔ Web App | HTTP + SSE | AI SDK UI Message Stream |
| Web App → Hub | HTTP (REST) | JSON API |
| Hub → Web App | HTTP (SSE) | AI SDK UI Message Stream (passthrough) |
| Daemon → Hub | WebSocket (outbound) | JSON messages |
| Hub → Daemon | WebSocket | JSON messages |

---

## 2. Hub REST API

The hub exposes a REST API for the web app (via `hub-client.ts`):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` | Health check (status, viber count, task count) |
| `GET` | `/api/vibers` | List connected vibers |
| `POST` | `/api/vibers` | Submit a task (`{ goal, viberId?, messages? }`) |
| `GET` | `/api/tasks` | List all tasks |
| `GET` | `/api/tasks/:id` | Get task status and events |
| `POST` | `/api/tasks/:id/stop` | Stop a running task |
| `GET` | `/api/tasks/:id/stream` | SSE stream of AI SDK response chunks |

### SSE Stream Endpoint

`GET /api/tasks/:id/stream` holds the connection open and relays AI SDK SSE bytes from the daemon. Key headers:

```
Content-Type: text/event-stream
x-vercel-ai-ui-message-stream: v1
```

The stream closes when the task completes, errors, or is stopped.

---

## 3. Hub ↔ Node Runtime (Daemon) WebSocket Protocol

Node runtimes (daemons) connect outbound to the hub at `ws://{hub}/ws` with auth headers:

```
Authorization: Bearer {token}
X-Viber-Id: {viberId}
X-Viber-Version: {version}
```

### Node Runtime → Hub Messages

| Type | Payload | When |
|------|---------|------|
| `connected` | `{ viber: ViberInfo }` | On WebSocket open |
| `task:started` | `{ taskId, spaceId }` | Task execution begins |
| `task:stream-chunk` | `{ taskId, chunk }` | Raw AI SDK SSE bytes |
| `task:progress` | `{ taskId, event }` | Progress envelope (status, deltas) |
| `task:completed` | `{ taskId, result }` | Task finished successfully |
| `task:error` | `{ taskId, error }` | Task failed |
| `heartbeat` | `{ status: ViberStatus }` | Periodic health (every 30s) |
| `pong` | `{}` | Response to ping |
| `terminal:*` | Various | Terminal streaming responses |

### Hub → Node Runtime Messages

| Type | Payload | When |
|------|---------|------|
| `task:submit` | `{ taskId, goal, messages?, options? }` | New task from operator |
| `task:stop` | `{ taskId }` | Stop a running task |
| `task:message` | `{ taskId, message, injectionMode? }` | Follow-up message during task |
| `ping` | `{}` | Keepalive |
| `config:update` | `{ config }` | Runtime config change |
| `terminal:list` | `{}` | Request terminal list |
| `terminal:attach` | `{ target, appId? }` | Attach to terminal |
| `terminal:detach` | `{ target, appId? }` | Detach from terminal |
| `terminal:input` | `{ target, keys, appId? }` | Send input to terminal |
| `terminal:resize` | `{ target, cols, rows, appId? }` | Resize terminal |

### ViberInfo Shape

```typescript
interface ViberInfo {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  runningTasks: string[];
  skills?: { id: string; name: string; description: string }[];
}
```

---

## 4. Task States

Tasks have a simple lifecycle:

```
pending → running → completed
                  → error
                  → stopped
```

| State | Meaning |
|-------|---------|
| `pending` | Task created, waiting for node runtime (daemon) to start |
| `running` | Node runtime (daemon) is executing (streaming in progress) |
| `completed` | Task finished successfully |
| `error` | Task failed (provider error, tool error, etc.) |
| `stopped` | Operator explicitly stopped the task |

---

## 5. Message Injection Modes

When an operator sends a follow-up message during a running task, the `injectionMode` controls behavior:

| Mode | Behavior |
|------|----------|
| `collect` | Buffer the message; merge into one follow-up after current run |
| `steer` | Queue for immediate processing; abort current run at next safe point |
| `followup` | Queue for processing after current run completes |

---

## 6. Terminal Streaming

Terminal I/O uses the same WebSocket connection between node runtime (daemon) and hub, with a dedicated message namespace (`terminal:*`). The hub relays terminal data to the web app via a separate WebSocket connection on port 6008 (not through the SSE stream).

---

## 7. Security

- **Outbound-only**: Node runtimes (daemons) connect outbound to the hub. No inbound ports needed.
- **Auth headers**: WebSocket connections include `Authorization` and `X-Viber-Id` headers.
- **CORS**: Hub sets `Access-Control-Allow-Origin: *` for development (should be restricted in production).
- **No secrets in stream**: The SSE stream contains only AI response content, never API keys or credentials.

---

## 8. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Passthrough SSE relay | Avoids re-encoding; the AI SDK format is the source of truth |
| Hub as stateless coordinator | Hub can restart without losing node runtime (daemon) connections (daemons auto-reconnect) |
| WebSocket for node runtime, SSE for browser | WebSocket is bidirectional (needed for task control); SSE is simpler for browser consumption |
| Simple task states | The AI SDK manages the complex agent loop; OpenViber just tracks the outer lifecycle |
| Chunk buffering in hub | Late-connecting SSE subscribers need to catch up without data loss |
