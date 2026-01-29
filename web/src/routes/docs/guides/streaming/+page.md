---
title: "Streaming"
description: Real-time response streaming in Viber
---
import { Aside } from "$lib/components/docs";



## Overview

Viber provides first-class support for streaming LLM responses, enabling real-time UI updates and progressive content display.

## Basic Streaming

```typescript
import { Agent } from 'viber';

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
import { useChat } from 'viber/react';

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

<Aside type="tip">
  Both React and Svelte integrations handle streaming automatically, updating the UI as chunks arrive.
</Aside>

## Server-Side Streaming

For HTTP endpoints, use the streaming response helpers:

```typescript
import { streamToResponse } from 'viber/server';

export async function POST(request: Request) {
  const { messages } = await request.json();
  
  const result = await agent.streamText({ messages });
  
  return streamToResponse(result);
}
```
