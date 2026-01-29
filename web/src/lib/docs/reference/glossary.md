---
title: "Glossary"
---
A comprehensive reference for Viber terminology and concepts.


- [A - H](/docs/#a)

  - [M - S](/docs/#m)

  - [T - X](/docs/#t)


## A

### Artifact

A living document within a Space that evolves over time. Artifacts can be:

- Documents (Markdown, text, HTML)
- Code files
- Data files (JSON, CSV)
- Binary files (images, PDFs)

Each artifact maintains version history, allowing you to track changes and rollback if needed.

### Agent

A specialized AI worker within Viber. Agents have specific roles and capabilities:

- **XAgent**: The orchestrating agent that coordinates the workspace
- **Researcher**: Gathers and synthesizes information
- **Writer**: Creates content and documentation
- **Developer**: Writes and reviews code
- **Reviewer**: Provides quality assurance

### Adapter

A storage backend implementation. Viber supports:

- **Local Adapter**: SQLite + Filesystem (default)
- **Supabase Adapter**: PostgreSQL + Supabase Storage (cloud)

## C

### Context

The accumulated information within a Space that agents use to understand and respond to requests. Context includes:

- Conversation history
- Artifact contents
- Space goal and metadata
- Previous agent decisions

### Conversation History

The complete record of messages between users and agents within a Space. History persists across sessions, enabling agents to maintain continuity.

## H

### History

See [Conversation History](#conversation-history).

## M

### Message

A single unit of communication within a conversation. Messages have:

- **role**: `user`, `assistant`, or `system`
- **content**: The message text
- **metadata**: Additional information (timestamps, agent info)

### Metadata

Additional information attached to messages, Spaces, or artifacts. Used for tracking, filtering, and agent coordination.

### Mode

The operational mode for agent interactions:

- **agent**: Standard agent mode for conversations
- **tool**: Mode for tool execution

## P

### Persistence

Viber's core capability of saving and restoring workspace state. Persistence enables:

- Session continuity across restarts
- Multi-day workflows
- Collaboration across time

### Provider

An LLM service provider. Supported providers:

- **OpenAI**: GPT-4, GPT-4o, GPT-4o-mini
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus
- **DeepSeek**: DeepSeek Chat, DeepSeek Coder
- **Google**: Gemini 1.5 Pro, Gemini 1.5 Flash

## S

### Space

The central container in Viber that holds all work. A Space includes:

- **spaceId**: Unique identifier
- **name**: Human-readable name
- **goal**: The workspace objective
- **history**: All conversation messages
- **artifacts**: Documents and files

Spaces are persistent — you can resume them at any time.

### Space-Oriented

Viber's design philosophy that differs from task-oriented frameworks:

| Aspect | Task-Oriented | Space-Oriented |
| ------ | ------------- | -------------- |
| Lifecycle | One-shot execution | Persistent, continuous |
| State | Ephemeral | Persistent |
| Artifacts | Output files | Living documents |
| Mental Model | "Run and done" | "Evolve and iterate" |

### Stream

Real-time delivery of agent responses as they're generated. Streaming provides better UX by showing content immediately rather than waiting for completion.

```typescript
const stream = await xAgent.streamText({...});
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

## T

### Tool

A capability that extends what agents can do. Tools allow agents to:

- Fetch external data
- Read/write files
- Search the web
- Execute code
- Interact with APIs

### Viber

The Space-oriented Collaborative Workspace Platform. Main exports:

| Export | Purpose |
| ------- | ------- |
| `viber` | Core runtime, types, orchestration, tools |
| `viber/react` | React hooks and components |
| `viber/svelte` | Svelte 5 reactive stores |

### TypeScript SDK

Viber is built with TypeScript and provides type-safe APIs:

```typescript
import type { Message } from "viber";
```

## V

### Version History

The record of changes to an artifact over time. Enables:

- Tracking evolution of documents
- Rollback to previous versions
- Audit trail of modifications

## X

### XAgent

The Strategic Task Orchestrator and Project Manager. XAgent:

- Serves as the primary interface for user interaction
- Coordinates specialist agents within a Space
- Maintains context across sessions
- Adapts plans based on evolving requirements

```typescript
// Start a new workspace
const xAgent = await XAgent.start("Write my thesis");

// Resume an existing workspace
const xAgent = await XAgent.resume(spaceId);

// Stream a response
const stream = await xAgent.streamText({
  messages: [{ role: "user", content: "Write the introduction" }],
  metadata: { mode: "agent", requestedAgent: "X" },
});
```

---

## Quick Reference

### Core API

```typescript
// Start a new Space
const xAgent = await XAgent.start(goal);

// Get the Space object
const space = xAgent.getSpace();

// Stream a response
const stream = await xAgent.streamText({ messages, metadata });

// Save the workspace
await space.persistState();

// Resume a Space
const xAgent = await XAgent.resume(spaceId);
```

### Space Properties

```typescript
space.spaceId       // Unique identifier
space.name          // Human-readable name
space.goal          // Workspace objective
space.history       // Conversation history
space.history.messages  // Array of messages
```

### Common Patterns

| Pattern | Description |
| ------- | ----------- |
| **Start → Work → Save** | Create workspace, collaborate, persist |
| **Resume → Continue** | Load existing workspace, continue work |
| **Multi-session** | Work over multiple days with full context |
| **Multi-agent** | XAgent coordinates specialists |
