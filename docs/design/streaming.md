---
title: "Streaming"
description: Real-time response streaming in Viber
---
## Overview

Viber provides first-class support for streaming LLM responses, enabling real-time UI updates and progressive content display.

## Channel block streaming (chat surfaces)

Many chat apps do **not** support token-delta updates, so streaming there is effectively **block streaming** (coarse chunks). This is a key reason the OpenViber Board web UI remains the preferred surface for high-fidelity streaming UX.

- **Block streaming**: send completed text blocks as the model generates them (coarse chunks), rather than token-by-token deltas.
- **Channel caps**: respect per-channel message limits (text length, max lines).
- **Chunking rules**: avoid splitting inside code fences; prefer paragraph/newline/sentence boundaries before hard cuts.
- **Coalescing**: allow a small idle window to merge tiny chunks to reduce spam.

This keeps output responsive on chat surfaces that cannot display token deltas.

## Streaming mode selection (auto-detect)

Streaming should auto-detect per channel:

- **Web UI**: prefer **token-delta streaming** for the best visual effect.
- **Chat apps**: fall back to **block streaming** when token deltas aren’t supported.

The transport layer should expose a capability flag so the viber runtime can pick the appropriate mode without manual configuration.

## Basic Streaming

```typescript
const agent = new Agent({
  name: 'Assistant',
  model: 'openai:gpt-4o',
});

const result = await agent.streamText({
  messages: [{ role: 'user', content: 'Tell me a story' }],
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Stream Events

The streaming result provides multiple event streams:

```typescript
const result = await agent.streamText({ messages });

// Text chunks
for await (const text of result.textStream) {
  console.log('Text:', text);
}

// Or access the full stream with metadata
for await (const event of result.fullStream) {
  switch (event.type) {
    case 'text-delta':
      console.log('Text:', event.textDelta);
      break;
    case 'tool-call':
      console.log('Tool called:', event.toolName);
      break;
    case 'tool-result':
      console.log('Tool result:', event.result);
      break;
  }
}
```

## React Integration

```tsx
function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    model: 'openai:gpt-4o',
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
```

## Svelte Integration

```svelte
<script lang="ts">
  import { createChatStore } from 'viber/svelte';

  const chat = createChatStore({
    model: 'openai:gpt-4o',
  });
</script>

{#each $chat.messages as message}
  <div>
    <strong>{message.role}:</strong>
    {message.content}
  </div>
{/each}

<form on:submit|preventDefault={() => chat.submit()}>
  <input bind:value={$chat.input} disabled={$chat.isLoading} />
</form>
```

::: tip
Both React and Svelte integrations handle streaming automatically, updating the UI as chunks arrive.
:::
## Server-Side Streaming

For HTTP endpoints, use the streaming response helpers:

```typescript
export async function POST(request: Request) {
  const { messages } = await request.json();
  
  const result = await agent.streamText({ messages });
  
  return streamToResponse(result);
}
```

## Chunking guidelines (for chat channels)

When block streaming is enabled, use a chunker with low/high bounds:

- **Low bound**: don’t emit until a minimum character count is reached.
- **High bound**: split before max size; if forced, split at max size.
- **Boundary preference**: paragraph → newline → sentence → whitespace → hard break.
- **Code fences**: never split inside a fence; if forced, close + reopen the fence.

Channel-level overrides should allow per-channel chunk sizes and chunking modes.
