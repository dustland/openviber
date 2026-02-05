---
title: "Package Structure & Exports"
description: "Understanding OpenViber's single-package architecture and modular exports"
---

## Package Overview

**OpenViber** is distributed as a **single unified package** (`openviber`) for maximum simplicity. All core functionality is available through a single import.

```bash
pnpm add openviber
```

```typescript
import { Viber, Agent, streamText } from "openviber";
```

## Architecture Principle

OpenViber follows a **stateless daemon** architecture:

- The daemon receives context per-request and returns results
- No conversation state stored in the daemon
- Context (history, plan, artifacts) managed by the Viber Board
- Configuration loaded from `~/.openviber/agents/{id}.yaml`

## Internal Structure

```
src/
├── core/           # Core agent and viber classes
│   ├── viber.ts         # Viber wrapper with context injection
│   ├── agent.ts         # Config-driven agent implementation
│   ├── config.ts        # Configuration types
│   ├── message.ts       # Message types and history
│   ├── provider.ts      # LLM provider abstraction
│   ├── tool.ts          # Tool definitions and registry
│   └── prompts.ts       # Prompt utilities
├── daemon/         # Daemon runtime and controller
│   ├── runtime.ts       # Task execution runtime
│   ├── controller.ts    # HTTP/WS controller
│   └── scheduler.ts     # Job scheduling
├── channels/       # Communication channels
│   ├── web.ts           # Web/WebSocket channel
│   ├── dingtalk.ts      # DingTalk integration
│   └── wecom.ts         # WeCom integration
├── skills/         # Skill registry and implementations
│   ├── registry.ts      # Skill loader and registry
│   └── types.ts         # Skill type definitions
├── tools/          # Built-in tools
│   ├── file.ts          # File operations
│   ├── browser.ts       # Browser automation
│   ├── search.ts        # Web search
│   └── desktop.ts       # Desktop automation
├── cli/            # Command-line interface
└── utils/          # Utility functions
```

## Core Exports

### Viber

The primary class for running agents with context injection:

```typescript
import { Viber } from "openviber";

const viber = new Viber(agentConfig);

const result = await viber.streamText({
  messages: conversationHistory,
  plan: currentPlan,      // Optional plan context
  memory: memoryExcerpt,  // Optional memory
  artifacts: artifactRefs // Optional artifact references
});
```

### Agent

Lower-level agent class for direct LLM interaction:

```typescript
import { Agent } from "openviber";

const agent = new Agent({
  name: "Assistant",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  skills: ["cursor-agent"],
  tools: ["file", "browser"],
});

const result = await agent.streamText({
  messages: [{ role: "user", content: "Hello" }]
});
```

### AI SDK Re-exports

OpenViber re-exports commonly used Vercel AI SDK functions:

```typescript
import { streamText, generateText } from "openviber";
```

## Configuration

Agent configuration lives in `~/.openviber/agents/{id}.yaml`:

```yaml
name: "Assistant"
description: "General-purpose assistant"
provider: "anthropic"
model: "claude-sonnet-4-20250514"

skills:
  - cursor-agent
  - tmux

tools:
  - file
  - browser

temperature: 0.7
maxTokens: 4096
```

## CLI

OpenViber includes a CLI for daemon management:

```bash
# Start the daemon
openviber start

# Run with specific agent
openviber start --agent myagent

# Stop the daemon
openviber stop
```

## Design Principles

- **Single Package**: No fragmented `@openviber/*` dependencies
- **Stateless Daemon**: No context stored between requests
- **Workspace-first**: `~/.openviber/` is the configuration home
- **AI SDK Compatible**: Full compatibility with Vercel AI SDK
- **Modular Skills**: Enable only what you need via configuration
