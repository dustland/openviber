---
title: "Streaming"
description: "How OpenViber streams LLM responses from daemon to browser using the AI SDK"
---

# Streaming

OpenViber streams LLM responses end-to-end using the [Vercel AI SDK](https://sdk.vercel.ai). The SDK handles token generation, tool calls, and UI rendering — OpenViber's job is to relay the stream from daemon to browser through the hub.

---

## 1. End-to-End Flow

```
Agent (AI SDK streamText)
  → streamResult.toUIMessageStreamResponse()   ← AI SDK generates SSE bytes
    → Controller reads SSE, sends task:stream-chunk over WebSocket
      → Hub buffers and pipes to SSE endpoint
        → Web API route pipes hub SSE to browser
          → @ai-sdk/svelte Chat class renders UI
```

Every hop is a byte-level passthrough of the AI SDK's **UI Message Stream** format. OpenViber doesn't parse, transform, or re-encode the stream — it just relays it.

---

## 2. How Each Layer Works

### Daemon (Controller)

The controller calls `runTask()` which invokes AI SDK `streamText()`. The result is converted to an SSE response and piped chunk-by-chunk over WebSocket:

```typescript
const { streamResult } = await runTask(goal, options, messages);

// AI SDK converts the stream to SSE format
const response = streamResult.toUIMessageStreamResponse();
const reader = response.body.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  // Relay raw SSE bytes to hub
  ws.send(JSON.stringify({
    type: "task:stream-chunk",
    taskId,
    chunk,
  }));
}
```

### Hub

The hub holds SSE connections open for web app subscribers. When `task:stream-chunk` messages arrive from the daemon, it writes them directly to subscribers:

```
GET /api/tasks/:id/stream
  Headers: x-vercel-ai-ui-message-stream: v1
  Content-Type: text/event-stream
```

The hub buffers chunks so that late-connecting subscribers can catch up. When the task completes, it closes all subscriber connections.

### Web App API Route

The SvelteKit API route at `/api/vibers/[id]/chat` submits the task to the hub, then pipes the hub's SSE stream to the browser:

```typescript
// Submit task
const { taskId } = await hubClient.submitTask(goal, viberId, messages);

// Connect to hub SSE stream and pipe to frontend
const streamResponse = await fetch(`${HUB_URL}/api/tasks/${taskId}/stream`);
return new Response(streamResponse.body, {
  headers: { "x-vercel-ai-ui-message-stream": "v1" },
});
```

### Frontend

The `@ai-sdk/svelte` `Chat` class consumes the SSE stream automatically:

```typescript
const chat = new Chat({
  transport: new DefaultChatTransport({
    api: `/api/vibers/${viberId}/chat`,
  }),
});
```

The Chat class handles text deltas, tool call rendering, and state management. OpenViber's frontend code focuses on UI — not stream parsing.

---

## 3. What the AI SDK Handles

| Concern | Handled By |
|---------|-----------|
| Token-by-token streaming | AI SDK `streamText()` |
| SSE encoding | AI SDK `toUIMessageStreamResponse()` |
| Client-side state management | `@ai-sdk/svelte` `Chat` class |
| Tool call / result rendering | AI SDK message parts |
| Multi-step tool loops | AI SDK `maxSteps` / `stepCountIs()` |
| Backpressure | Built-in to SSE + `ReadableStream` |

---

## 4. What OpenViber Adds

### WebSocket Relay

The AI SDK is designed for direct HTTP (browser → server → LLM). OpenViber adds a relay layer because the daemon runs on a separate machine from the web server:

```
Browser  ←SSE→  Web App  ←SSE→  Hub  ←WS→  Daemon  ←HTTP→  LLM
```

The hub bridges WebSocket (daemon side) and SSE (browser side). This is the core infrastructure OpenViber provides on top of the AI SDK.

### Chunk Buffering

The hub buffers stream chunks per task so that:
- Late-connecting SSE subscribers catch up.
- Completed tasks can replay their full stream on request.
- Network interruptions don't lose data.

### Task Lifecycle Messages

Beyond the stream relay, the hub tracks task state transitions (`pending → running → completed | error | stopped`) and provides REST endpoints for task management.

---

## 5. Future: Block Streaming for Chat Channels

Chat platforms (DingTalk, WeCom, Slack) cannot consume SSE streams. For these channels, a **block chunking** layer will coalesce token deltas into completed text blocks:

- Buffer tokens until a paragraph/sentence boundary.
- Respect per-channel message length limits.
- Never split inside code fences.
- Coalesce small bursts to reduce message spam.

This layer sits between the AI SDK stream and channel delivery — it doesn't change the core streaming architecture.
