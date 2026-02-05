---
title: "Multi-Agent Collaboration"
description: "Future direction for multi-agent orchestration in OpenViber"
---

# Multi-Agent Collaboration

> **Status: Not Implemented**
>
> OpenViber currently uses a single-agent architecture. A single well-configured agent with skills is sufficient for the stateless, clawdbot-alike design. This document describes potential future multi-agent patterns if needed.

## Current Architecture

OpenViber follows a single-agent model:

```
┌─────────────────────────────────────────────────────────────┐
│  Human (Manager)                                             │
│  "Build a landing page with a contact form"                  │
└─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Viber (Single Agent + Skills)                               │
│  Plans work, uses tools, executes with skill knowledge       │
└─────────────────────────────────────────────────────────────┘
```

## Why Single Agent?

For the stateless daemon architecture:

1. **Simplicity**: One agent with appropriate skills handles most tasks
2. **Stateless**: No coordination state to maintain between agents
3. **Context efficiency**: Single agent means single context window
4. **Sufficient capability**: Skills provide domain knowledge; tools provide actions

## When Multi-Agent Might Be Needed

| Scenario | Single Agent Solution | When Multi-Agent Helps |
|----------|----------------------|------------------------|
| Different domains | Add skills for each domain | Domains require conflicting behaviors |
| Parallel work | Sequential execution | True parallelism on independent subtasks |
| Review/QA | Self-review prompts | Formal separation of concerns |

## Future Multi-Agent Patterns

If multi-agent is implemented in the future:

### Pattern 1: Specialist Delegation

```
Viber (Orchestrator)
  ├── Developer Agent (coding skill)
  ├── Reviewer Agent (review skill)
  └── Designer Agent (design skill)
```

### Pattern 2: Pipeline

```
Planner → Executor → Verifier → Reporter
```

### Implementation Considerations

1. **Stateless coordination**: All state in Viber Board, not daemon
2. **Context passing**: How to share context between agents efficiently
3. **Cost**: Multiple agents = multiple LLM calls
4. **Complexity**: Is it worth the added complexity?

## Recommendation

For most use cases, stick with a single agent configured with:

- Clear system prompt defining the role
- Appropriate skills for domain knowledge
- Required tools for actions
- Good working mode (Always Ask / Agent Decides / Always Execute)

Multi-agent should only be considered when there's a clear benefit that can't be achieved with skills and tools.
