---
title: "API Reference"
description: Complete API reference for OpenViber
---

## Core Exports

```typescript
import {
  Viber,
  Agent,
  streamText,
  generateText,
} from "openviber";
```

---

## Viber

The primary class for running agents with context injection.

### Constructor

```typescript
new Viber(config: AgentConfig, options?: ViberOptions)
```

### ViberOptions

| Property | Type | Description |
|----------|------|-------------|
| `model` | `string` | Override model |
| `agentId` | `string` | Agent identifier |
| `config` | `Partial<AgentConfig>` | Config overrides |

### Methods

#### `streamText(options)`

Stream a text response with context injection.

```typescript
const result = await viber.streamText({
  messages: Message[],
  plan?: string,           // Plan context (markdown)
  memory?: string,         // Memory excerpt
  artifacts?: ArtifactRef[], // Artifact references
  metadata?: Record<string, any>,
});
```

#### `generateText(options)`

Generate a complete text response (non-streaming).

```typescript
const result = await viber.generateText({
  messages: Message[],
  plan?: string,
  memory?: string,
  artifacts?: ArtifactRef[],
});
```

#### `getAgent()`

Get the underlying Agent instance.

```typescript
const agent = viber.getAgent();
```

#### `getSummary()`

Get agent summary information.

```typescript
const summary = viber.getSummary();
// { id, name, description, tools, llmModel, agentId }
```

---

## Agent

The core agent class for LLM interaction.

### Constructor

```typescript
new Agent(config: AgentConfig)
```

### AgentConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✓ | Agent identifier |
| `description` | `string` | ✓ | Agent description |
| `provider` | `string` | ✓ | LLM provider |
| `model` | `string` | ✓ | Model identifier |
| `systemPrompt` | `string` | | Agent instructions |
| `tools` | `string[]` | | Available tools |
| `skills` | `string[]` | | Loaded skills |
| `temperature` | `number` | | Creativity (0-1) |
| `maxTokens` | `number` | | Response limit |

### Methods

#### `streamText(options)`

Stream a text response.

```typescript
const result = await agent.streamText({
  messages: ViberMessage[],
  system?: string,
  spaceId?: string,
  metadata?: Record<string, any>,
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

#### `generateText(options)`

Generate a complete text response.

```typescript
const result = await agent.generateText({
  messages: ViberMessage[],
  system?: string,
});
```

---

## Message Types

### ViberMessage

```typescript
interface ViberMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  metadata?: Record<string, any>;
}
```

### ArtifactRef

```typescript
interface ArtifactRef {
  id: string;
  title?: string;
  type?: string;  // "file" | "screenshot" | "log"
  ref?: string;   // Path or URL
}
```

---

## Daemon Runtime

### runTask

Execute a task through the daemon runtime.

```typescript
import { runTask } from "openviber";

const { streamResult, agent } = await runTask(
  "Build a landing page",
  {
    taskId: "task-123",
    singleAgentId: "developer",
    model: "anthropic/claude-3-5-sonnet",
  },
  messages
);
```

### loadViberConfig

Load viber configuration from file.

```typescript
import { loadViberConfig } from "openviber";

const config = await loadViberConfig("developer");
// Loads from ~/.openviber/vibers/developer.yaml
```

---

## AI SDK Re-exports

OpenViber re-exports key Vercel AI SDK functions:

```typescript
import { streamText, generateText } from "openviber";

// Use directly
const result = await streamText({
  model: openai("gpt-4o"),
  messages: [{ role: "user", content: "Hello" }],
});
```
