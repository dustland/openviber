---
title: "Agents"
description: Define and configure AI agents in OpenViber
---

# Agents

Agents are the core building blocks of OpenViber. Each agent is configured through YAML files with a specific role, tools, skills, and LLM settings.

## Viber Class

The **Viber** class is the primary interface for running agents. It wraps an Agent with context injection for plans, memory, and artifacts.

```typescript
import { Viber } from "openviber";

const viber = new Viber(agentConfig);

// Stream with context injection
const result = await viber.streamText({
  messages: conversationHistory,
  plan: taskPlan,        // Injected into system prompt
  memory: memoryExcerpt, // Injected into system prompt
});
```

## Agent Class

For direct agent interaction without context injection:

```typescript
import { Agent } from "openviber";

const agent = new Agent({
  name: "Developer",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  systemPrompt: "You are an expert software developer.",
  tools: ["file", "terminal", "browser"],
  skills: ["cursor-agent"],
});

const result = await agent.streamText({
  messages: [{ role: "user", content: "Build a React component" }],
});
```

## Agent Configuration

Agents are configured via YAML files in `~/.openviber/agents/`:

```yaml
# ~/.openviber/agents/developer.yaml
name: "Developer"
description: "Expert software developer"
provider: "anthropic"
model: "claude-sonnet-4-20250514"

systemPrompt: |
  You are an expert software developer.
  Write clean, well-documented code.

tools:
  - file
  - terminal
  - browser

skills:
  - cursor-agent

temperature: 0.7
maxTokens: 4096
```

### Configuration Options

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Agent identifier |
| `description` | `string` | What the agent does |
| `provider` | `string` | LLM provider (anthropic, openai, openrouter) |
| `model` | `string` | Model identifier |
| `systemPrompt` | `string` | Instructions defining behavior |
| `tools` | `string[]` | Tools available to the agent |
| `skills` | `string[]` | Skills that inject domain knowledge |
| `temperature` | `number` | Creativity level (0-1) |
| `maxTokens` | `number` | Maximum response tokens |

## Tools and Skills

Agents gain capabilities through **tools** (actions) and **skills** (knowledge):

```
┌─────────────────────────────────────────────┐
│                   Agent                      │
├─────────────────────────────────────────────┤
│  Skills (knowledge)                          │
│  • cursor-agent, tmux, antigravity...        │
├─────────────────────────────────────────────┤
│  Tools (actions)                             │
│  • file, terminal, browser, desktop...       │
└─────────────────────────────────────────────┘
```

### Tool Execution Flow

1. Agent decides to use a tool
2. Parameters are validated against schema
3. Tool executes and returns result
4. Agent continues with result

### Skills vs Tools

| Aspect | Skills | Tools |
|--------|--------|-------|
| Purpose | Teach domain knowledge | Provide actions |
| Loaded as | System prompt instructions | Callable functions |
| Example | "How to use Cursor IDE" | `file.write()` |

## Working Modes

OpenViber supports three autonomy levels:

| Mode | Behavior |
|------|----------|
| **Always Ask** | Agent asks before each action |
| **Agent Decides** | Acts within policy boundaries |
| **Always Execute** | Maximum autonomy |

## Best Practices

1. **Clear Purpose**: Each agent should have one clear role
2. **Explicit Prompts**: Write specific system prompts
3. **Minimal Tools**: Only provide tools relevant to the role
4. **Appropriate Skills**: Add skills that match the domain
5. **Temperature Tuning**: Lower for factual, higher for creative
