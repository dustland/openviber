# Viber

**Multi-agent collaboration framework supporting React and Svelte**

Viber is a flexible multi-agent AI framework for building collaborative AI applications. It provides:

- 🤖 **Agent System** - Define and orchestrate multiple AI agents
- 🛠️ **Tool Framework** - Decorator-based tool definitions with Zod schemas
- 📦 **Space Management** - Organize conversations, artifacts, and tasks
- 🔄 **State Management** - Zustand-based reactive state
- 🎯 **Framework Agnostic** - Works with React, Svelte, or vanilla JS

## Installation

```bash
npm install viber
# or
pnpm add viber
```

## Quick Start

```typescript
import { Agent, Space, streamText } from 'viber';

// Create an agent
const agent = new Agent({
  name: 'Assistant',
  model: 'openai:gpt-4o',
  systemPrompt: 'You are a helpful assistant.',
});

// Stream a response
const result = await agent.streamText({
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## Documentation

See the [docs](./docs) folder for full documentation and examples.

## License

MIT
