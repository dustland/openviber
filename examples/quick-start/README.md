# Quick Start

Get started with Viber in 5 minutes.

## Setup

```bash
# Install dependencies
pnpm install

# Copy the environment template
cp env.example .env

# Edit .env and add your OpenRouter API key (sk-or-...)
```

## Examples

### 1. Basic Usage

The simplest way to use Viber:

```bash
pnpm basic
```

```typescript
import { XAgent } from "viber";

// Start a Space (returns XAgent)
const xAgent = await XAgent.start("Help me write a blog post");
const space = xAgent.getSpace();

// Stream a response
const stream = await xAgent.streamText({
  messages: [{ role: "user", content: "Write an introduction" }],
  metadata: { mode: "agent", requestedAgent: "X" },
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

// Save for later
await space.persistState();
```

### 2. Streaming Responses

For real-time output:

```bash
pnpm stream
```

### 3. Resume a Session

Continue where you left off:

```bash
# First, create a space
pnpm basic
# Output: Saved! Resume with: SPACE_ID=proj_abc123

# Later, resume it
SPACE_ID=proj_abc123 pnpm resume
```

```typescript
// Resume existing space
const xAgent = await XAgent.resume("proj_abc123");
const space = xAgent.getSpace();

// XAgent remembers everything!
const stream = await xAgent.streamText({
  messages: [{ role: "user", content: "Continue what you were doing" }],
  metadata: { mode: "agent", requestedAgent: "X" },
});
```

### 4. Interactive Mode

Chat interactively:

```bash
pnpm start
```

## Key Concepts

### Space

A persistent workspace that holds your work:

- Conversation history
- Context that accumulates

### XAgent

Your AI assistant that:

- Remembers everything across sessions
- Coordinates specialist agents
- Adapts to your feedback

## What Makes Viber Different

| Traditional AI          | Viber                    |
| ----------------------- | ------------------------ |
| Forgets after each chat | Remembers forever        |
| Single session          | Multi-session continuity |

## Next Steps

- [Thesis Writer](../thesis-writer) - Multi-session document editing
- [Research Assistant](../research-assistant) - Knowledge accumulation
- [Code Review](../code-review) - Collaborative code review
