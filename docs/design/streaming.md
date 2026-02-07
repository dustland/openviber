---
title: "Streaming"
description: "Real-time response streaming architecture for OpenViber"
---

# Streaming

OpenViber supports real-time streaming of LLM responses from the node to clients. The streaming architecture has two layers: **token-delta streaming** for high-fidelity UIs and **block streaming** for chat channels with limited capabilities.

---

## 1. Streaming Modes

| Mode | Transport | Best For |
|------|-----------|----------|
| **Token-delta** | WebSocket `task:delta` messages | OpenViber Board (web UI), CLI |
| **Block** | Channel-specific delivery (chat APIs, email) | DingTalk, WeCom, Slack |

Mode selection is automatic based on channel capabilities. The node's runtime detects the transport and emits the appropriate stream granularity.

---

## 2. Token-Delta Streaming (WebSocket)

The primary streaming path uses the WebSocket protocol defined in [protocol.md](./protocol.md). When a client submits a task with `stream_deltas: true`, the node emits `task:delta` messages as the model generates output.

### Protocol Integration

```typescript
// Client requests streaming
const submit: TaskSubmit = {
  type: "task:submit",
  payload: {
    idempotency_key: "abc-123",
    goal: "Build a landing page",
    messages: [...],
    options: {
      stream_deltas: true,  // Enable token-level streaming
    },
  },
};

// Node emits deltas as they arrive
// → task:started
// → task:delta { delta_type: "text", text: "I'll start by..." }
// → task:delta { delta_type: "text", text: " creating the HTML..." }
// → task:delta { delta_type: "tool_call", tool_call: { name: "write_file", ... } }
// → task:delta { delta_type: "tool_result", tool_result: { ... } }
// → task:completed
```

### Delta Types

The `task:delta` message carries three delta types (see [protocol.md](./protocol.md) for full schemas):

| `delta_type` | Content | UI Behavior |
|--------------|---------|-------------|
| `text` | Partial text token | Append to message bubble |
| `tool_call` | Tool name + partial arguments | Show tool invocation card |
| `tool_result` | Completed tool output | Render tool result inline |

### Board UI Consumption

The OpenViber Board (SvelteKit) consumes deltas via the existing WebSocket connection:

```typescript
// Simplified Board-side delta handling
function handleDelta(delta: TaskDelta) {
  switch (delta.payload.delta_type) {
    case "text":
      appendToCurrentMessage(delta.payload.text);
      break;
    case "tool_call":
      showToolCallCard(delta.payload.tool_call);
      break;
    case "tool_result":
      updateToolCallResult(delta.payload.tool_result);
      break;
  }
}
```

---

## 3. Block Streaming (Chat Channels)

Many chat platforms (DingTalk, WeCom, Slack) do not support token-delta updates. For these channels, the node coalesces token deltas into **completed text blocks** before delivery.

### Why Block Streaming

- Chat APIs have rate limits and message-length caps.
- Token-by-token delivery would spam the channel with tiny updates.
- Users on mobile prefer fewer, complete messages over rapid partial updates.

### Chunking Pipeline

```
Token stream → Accumulator → Boundary detector → Channel formatter → Delivery
```

The chunker buffers tokens and emits blocks based on configurable bounds:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `min_chars` | 200 | Don't emit until this threshold |
| `max_chars` | 2000 | Force-split before this limit |
| `idle_ms` | 1500 | Emit accumulated text after idle gap |
| `coalesce_ms` | 500 | Merge small bursts within this window |

### Boundary Preference

When splitting a block, the chunker picks the best boundary in priority order:

1. **Paragraph break** (`\n\n`) — cleanest split
2. **Newline** (`\n`) — next best
3. **Sentence end** (`. `, `! `, `? `) — preserves readability
4. **Whitespace** — fallback
5. **Hard cut** at `max_chars` — last resort

### Code Fence Protection

Code blocks require special handling to avoid broken formatting:

- **Never split inside a code fence.** If forced (block exceeds `max_chars`), close the fence at the split point and reopen it in the next block.
- Track fence state (open/closed) across chunks.

### Channel-Level Overrides

Each channel can override chunking defaults in the viber configuration:

```yaml
# ~/.openviber/vibers/dev.yaml
channels:
  dingtalk:
    chunk_max_chars: 4000
    chunk_idle_ms: 2000
  wecom:
    chunk_max_chars: 2000
    chunk_idle_ms: 1000
```

---

## 4. Error Handling During Streaming

Streaming introduces failure modes that don't exist in request-response patterns. See [error-handling.md](./error-handling.md) for the full error taxonomy.

| Failure | Behavior |
|---------|----------|
| **WebSocket disconnect** | Buffer unsent deltas; resend on reconnect (idempotent) |
| **Provider stream error** | Emit `task:error` with `partial_result` containing text so far |
| **Channel delivery failure** | Retry with backoff; coalesce missed blocks into one catch-up message |
| **Client-initiated stop** | `task:stop` → node aborts stream → `task:stopped` with partial result |

### Partial Results

When a stream fails mid-generation, the node always includes a `partial_result` in the error or stop response. This ensures the Board can display whatever was generated before the failure.

---

## 5. Backpressure

If the client cannot keep up with delta messages (slow network, heavy UI rendering):

- The WebSocket layer applies per-message buffering with a configurable high-water mark.
- If the buffer overflows, the node **coalesces pending deltas** into a single larger message rather than dropping tokens.
- The Board should process deltas in `requestAnimationFrame` batches to avoid DOM thrashing.

---

## 6. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Auto-detect mode per channel | Vibers shouldn't need to know about channel capabilities |
| Coalesce rather than drop on backpressure | Every token matters; losing text degrades UX |
| Code fence tracking in chunker | Broken code blocks are the #1 readability complaint on chat surfaces |
| `partial_result` on all failure paths | The user should always see what was generated, even if the task failed |
