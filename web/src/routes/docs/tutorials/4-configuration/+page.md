---
title: "Tutorial 4: Configuration Deep Dive"
---


**⏱️ Time: 30 minutes | 🎯 Goal: Master Space and Agent configuration**

In this tutorial, you'll learn how to configure every aspect of your Viber workspace for production use.

## What You'll Learn

- LLM provider configuration
- Storage adapter options
- Environment variable management
- Production deployment patterns

## Prerequisites

- Completed previous tutorials
- Understanding of Viber concepts
- An LLM API key

---

## Understanding Configuration

Viber is designed to be flexible. Key configuration areas:

1. **LLM Providers** — Which AI model to use
2. **Storage Adapters** — Where to persist data
3. **Agent Settings** — How agents behave
4. **Environment** — Managing secrets and settings

## Step 1: LLM Provider Configuration

Viber supports multiple LLM providers through the Vercel AI SDK:

### OpenAI

```bash
# .env
OPENAI_API_KEY=sk-your-key
```

### Anthropic

```bash
# .env
ANTHROPIC_API_KEY=your-key
```

### DeepSeek

```bash
# .env
DEEPSEEK_API_KEY=your-key
```

### Google (Gemini)

```bash
# .env
GOOGLE_GENERATIVE_AI_API_KEY=your-key
```

The provider is automatically detected based on which environment variable is set.

## Step 2: Storage Configuration

Viber supports two storage backends:

### Local Storage (Default)

Uses SQLite for structured data and the filesystem for files. Perfect for:

- Local development
- Desktop applications
- Offline-first apps

```typescript
import { XAgent } from "viber";
import { createLocalAdapter } from "@viber/local";

// Create a local adapter (optional - this is the default)
const adapter = createLocalAdapter({
  path: "./data", // Where to store data
});

const xAgent = await XAgent.start("My project", {
  adapter,
});
```

### Supabase (Cloud)

Uses PostgreSQL for structured data and Supabase Storage for files. Ideal for:

- Cloud-hosted applications
- Multi-user collaboration
- Apps requiring authentication

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

```typescript
import { XAgent } from "viber";
import { createSupabaseAdapter } from "@viber/supabase";

const adapter = createSupabaseAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
});

const xAgent = await XAgent.start("My project", {
  adapter,
});
```

## Step 3: Environment Management

### Development Setup

Create a `.env` file:

```bash
# LLM Provider
OPENAI_API_KEY=sk-your-key

# Optional: Supabase for cloud storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Development settings
NODE_ENV=development
LOG_LEVEL=debug
```

### Production Setup

For production, use secure environment management:

```bash
# Production .env (or use your platform's secrets management)
OPENAI_API_KEY=sk-production-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
NODE_ENV=production
LOG_LEVEL=info
```

### Loading Environment Variables

Always load environment variables at the start of your application:

```typescript
import "dotenv/config";
// or
import { config } from "dotenv";
config();
```

## Step 4: Agent Configuration

### Default Agent Configuration

Viber uses sensible defaults from `@viber/defaults`:

```typescript
import { XAgent } from "viber";

// Uses default configuration
const xAgent = await XAgent.start("My project");
```

### Custom Agent Configuration

You can customize agent behavior through YAML files in `@viber/defaults`:

**Default agents include:**

- **X** — The orchestrating agent (project manager)
- **Researcher** — Gathers information
- **Writer** — Creates content
- **Developer** — Writes code
- **Reviewer** — Quality assurance
- **Web Designer** — HTML/CSS creation

### Prompt Templates

Agent prompts are stored in `@viber/defaults/prompts/`. You can override them:

```typescript
import { XAgent } from "viber";

const xAgent = await XAgent.start("My project", {
  // Custom system prompt for XAgent
  systemPrompt: `You are a specialized assistant for...`,
});
```

## Step 5: Production Configuration Example

Here's a complete production setup:

```typescript
// src/config.ts
import "dotenv/config";
import { createSupabaseAdapter } from "@viber/supabase";

// Validate required environment variables
const requiredEnvVars = [
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Create production adapter
export const adapter = createSupabaseAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
});

// Export configuration
export const config = {
  isProduction: process.env.NODE_ENV === "production",
  logLevel: process.env.LOG_LEVEL || "info",
};
```

```typescript
// src/index.ts
import { XAgent } from "viber";
import { adapter, config } from "./config.js";

async function main() {
  console.log(`Starting in ${config.isProduction ? "production" : "development"} mode`);

  const xAgent = await XAgent.start("Production workspace", {
    adapter,
  });

  // Your application logic...
}

main().catch(console.error);
```

## Step 6: React Integration Configuration

For React applications, use `@viber/react`:

```bash
pnpm add @viber/react
```

```typescript
// app/actions.ts (Next.js Server Actions)
"use server";

import { XAgent } from "viber";

export async function createSpace(goal: string) {
  const xAgent = await XAgent.start(goal);
  return xAgent.getSpace().spaceId;
}

export async function sendMessage(spaceId: string, message: string) {
  const xAgent = await XAgent.resume(spaceId);
  const stream = await xAgent.streamText({
    messages: [{ role: "user", content: message }],
    metadata: { mode: "agent", requestedAgent: "X" },
  });
  return stream;
}
```

```typescript
// app/components/Chat.tsx
"use client";

import { useSpace, useChat } from "@viber/react";

export function Chat({ spaceId }: { spaceId: string }) {
  const { space } = useSpace(spaceId);
  const { messages, sendMessage, isLoading } = useChat(spaceId);

  return (
    <div>
      <h2>{space?.name}</h2>
      {messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}
      <button onClick={() => sendMessage("Hello!")}>Send</button>
    </div>
  );
}
```

## Best Practices

### 1. Environment Variables

```bash
# Never commit secrets
echo ".env" >> .gitignore

# Use .env.example for documentation
cp .env .env.example
# Remove actual secrets from .env.example
```

### 2. Error Handling

```typescript
try {
  const xAgent = await XAgent.start("My project");
} catch (error) {
  if (error.message.includes("API key")) {
    console.error("Missing or invalid API key");
  } else if (error.message.includes("network")) {
    console.error("Network error - check your connection");
  } else {
    throw error;
  }
}
```

### 3. Logging

```typescript
// Configure logging level
process.env.LOG_LEVEL = "debug"; // debug, info, warn, error

// In production
process.env.LOG_LEVEL = "info";
```

### 4. Resource Management

```typescript
// Always save state before exit
process.on("SIGINT", async () => {
  console.log("\nSaving workspace...");
  await space.persistState();
  process.exit(0);
});
```

## Configuration Reference

### XAgent.start() Options

| Option | Type | Description |
| ------ | ---- | ----------- |
| `adapter` | `DataAdapter` | Storage adapter (local or Supabase) |
| `systemPrompt` | `string` | Override the default system prompt |

### XAgent.resume() Options

| Option | Type | Description |
| ------ | ---- | ----------- |
| `adapter` | `DataAdapter` | Storage adapter (must match original) |

### Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `OPENAI_API_KEY` | One LLM key required | OpenAI API key |
| `ANTHROPIC_API_KEY` | One LLM key required | Anthropic API key |
| `DEEPSEEK_API_KEY` | One LLM key required | DeepSeek API key |
| `SUPABASE_URL` | For cloud storage | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | For cloud storage | Supabase service key |
| `NODE_ENV` | No | `development` or `production` |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |

## 🎉 Congratulations!

You now understand how to configure Viber for any environment:

✅ **LLM Provider Configuration**  
✅ **Storage Adapter Options**  
✅ **Environment Variable Management**  
✅ **Production Deployment Patterns**  
✅ **React Integration**  

## 🚀 What's Next?

You've completed the core Viber tutorials! Here are some next steps:

- **[Advanced: Comprehensive Systems](/docs/tutorials/91-comprehensive-systems)** — Build a complete production system
- **[SDK Reference](/sdk)** — Explore the complete API
- **[Examples](https://github.com/dustland/viber/tree/main/examples)** — See real-world implementations

## 🔧 Troubleshooting

**Configuration not taking effect?**

- Ensure environment variables are loaded before using them
- Check for typos in variable names
- Verify the `.env` file is in the correct directory

**Storage errors?**

- For Supabase, verify your URL and key are correct
- For local storage, ensure the directory is writable
- Check file permissions

---

Ready for advanced topics? Continue to [Comprehensive Systems](/docs/tutorials/91-comprehensive-systems)! 🏭
