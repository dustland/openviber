---
title: "Tools"
description: Extend agent capabilities with custom tools
---
## Overview

Tools enable agents to interact with external systems, perform calculations, and access data. Viber uses a decorator-based approach with automatic Zod schema generation.

## Defining Tools

```typescript
import { z } from 'zod';

const calculator = tool({
  name: 'calculator',
  description: 'Perform mathematical calculations',
  parameters: z.object({
    expression: z.string().describe('Mathematical expression to evaluate'),
  }),
  execute: async ({ expression }) => {
    return { result: eval(expression) };
  },
});
```

## Using Tools with Agents

```typescript
const agent = new Agent({
  name: 'MathAssistant',
  model: 'openai:gpt-4o',
  systemPrompt: 'You are a math tutor.',
  tools: [calculator],
});
```

## Tool Schema

The `parameters` field uses Zod schemas, which are automatically converted to JSON Schema for LLM consumption:

```typescript
const searchTool = tool({
  name: 'web_search',
  description: 'Search the web for information',
  parameters: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().optional().default(10).describe('Max results'),
  }),
  execute: async ({ query, limit }) => {
    // Implementation
  },
});
```

## Built-in Tools

Viber includes several built-in tools:

| Tool | Description |
|------|-------------|
| `readFile` | Read file contents from the workspace |
| `writeFile` | Write content to a file |
| `shellCommand` | Execute shell commands (sandboxed) |
| `webSearch` | Search the web |
| `webScrape` | Extract content from URLs |

::: caution
Shell commands are executed in a sandboxed environment for security.
:::
## Error Handling

Tools should handle errors gracefully:

```typescript
const safeTool = tool({
  name: 'safe_operation',
  parameters: z.object({ input: z.string() }),
  execute: async ({ input }) => {
    try {
      const result = await riskyOperation(input);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});
```
