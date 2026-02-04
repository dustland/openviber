---
title: "Agents"
description: Define and orchestrate AI agents in OpenViber
---

# Agents

Agents are the core building blocks of OpenViber. Each agent is a specialized entity designed to perform specific tasks, with its own role, tools, skills, and configuration.

## ViberAgent

The primary agent you interact with is **ViberAgent** — it represents your viber and orchestrates all work.

```typescript
import { ViberAgent } from "openviber";

// Start a new viber session
const viber = await ViberAgent.start("Build a landing page for our product", {
  model: "anthropic/claude-3.5-sonnet",
});

// Or resume an existing session
const viber = await ViberAgent.resume(spaceId);
```

## Creating Worker Agents

For specialized tasks, create worker agents that ViberAgent can delegate to:

```typescript
import { Agent } from "openviber";

const writer = new Agent({
  name: "Writer",
  model: "openai:gpt-4o",
  systemPrompt: `You are a professional writer who creates 
                 high-quality, engaging content.`,
  tools: ["file"],
});

const developer = new Agent({
  name: "Developer",
  model: "anthropic/claude-3.5-sonnet",
  systemPrompt: "You are an expert software developer.",
  tools: ["file", "terminal", "browser"],
  skills: ["coding"],
});
```

## Agent Configuration

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier for the agent |
| `model` | `string` | LLM model identifier (e.g., `openai:gpt-4o`) |
| `systemPrompt` | `string` | Instructions defining the agent's behavior |
| `tools` | `string[]` | Tools available to the agent |
| `skills` | `string[]` | Skills that inject domain knowledge |
| `temperature` | `number` | Creativity level (0-1) |
| `requireApproval` | `string[]` | Tools that need human approval |

## Tools and Skills

Agents gain capabilities through **tools** and **skills**:

```
┌─────────────────────────────────────────────┐
│                   Agent                      │
├─────────────────────────────────────────────┤
│  Skills (knowledge)                          │
│  • coding, research, writing...              │
├─────────────────────────────────────────────┤
│  Tools (actions)                             │
│  • terminal, browser, file, office...        │
└─────────────────────────────────────────────┘
```

### Registering Tools

```typescript
const agent = new Agent({
  name: "Developer",
  model: "openai:gpt-4o",
  tools: ["file", "terminal", "browser"],
  requireApproval: ["terminal"], // Human approval before execution
});
```

### Tool Execution Flow

1. Agent decides to use a tool
2. Parameters are validated against schema
3. If approval required, waits for human
4. Tool executes and returns result
5. Agent continues with result

### Human-in-the-Loop Approval

Sensitive tools can require approval:

```typescript
const agent = new Agent({
  name: "Developer",
  tools: ["write_file", "execute_code", "read_file"],
  requireApproval: ["write_file", "execute_code"],
});

// Frontend handles approval
if (status === "awaiting-approval") {
  await approveToolCall(toolCallId, true);
}
```

## Multi-Agent Collaboration

ViberAgent coordinates worker agents for complex tasks:

```typescript
const team = [writer, developer, reviewer];

const viber = await ViberAgent.start("Build a documentation site", {
  model: "anthropic/claude-3.5-sonnet",
  team,
});
```

The ViberAgent will:
1. Break down the goal into tasks
2. Assign tasks to appropriate workers
3. Coordinate handoffs between agents
4. Report progress and results

See [Multi-Agent Collaboration](/docs/design/multi-agent-collaboration) for the full orchestration model.

## Best Practices

1. **Single Responsibility**: Each agent should have one clear purpose
2. **Clear Prompts**: Write explicit system prompts that define behavior
3. **Appropriate Tools**: Only provide tools relevant to the agent's role
4. **Least Privilege**: Use `requireApproval` for sensitive operations
5. **Temperature Tuning**: Use lower temperatures for factual tasks, higher for creative ones
