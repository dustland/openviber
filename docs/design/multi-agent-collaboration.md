---
title: "Multi-Agent Collaboration"
description: "How ViberAgent orchestrates worker agents to accomplish complex tasks"
---

# Multi-Agent Collaboration

ViberAgent is the orchestrating agent that represents your viber. It coordinates worker agents to accomplish complex tasks that require specialized skills.

## The Orchestration Model

```
┌─────────────────────────────────────────────────────────────┐
│  Human (Manager)                                             │
│  "Build a landing page with a contact form"                  │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│  ViberAgent (Orchestrator)                                   │
│  Plans work, assigns tasks, coordinates handoffs             │
└─────────────────────────────────┬───────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
    ┌───────────┐           ┌───────────┐           ┌───────────┐
    │ Developer │           │ Designer  │           │ Reviewer  │
    │   Agent   │           │   Agent   │           │   Agent   │
    └───────────┘           └───────────┘           └───────────┘
```

## ViberAgent Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Goal Decomposition** | Break down complex goals into actionable tasks |
| **Task Assignment** | Match tasks to agents with appropriate skills |
| **Coordination** | Manage dependencies and handoffs between agents |
| **Progress Tracking** | Monitor completion and update the plan |
| **Reporting** | Provide status updates and evidence to the manager |

## Defining a Team

```typescript
import { ViberAgent, Agent } from "openviber";

const developer = new Agent({
  name: "Developer",
  model: "anthropic/claude-3.5-sonnet",
  systemPrompt: "You are an expert full-stack developer.",
  tools: ["file", "terminal", "browser"],
  skills: ["coding"],
});

const designer = new Agent({
  name: "Designer",
  model: "openai:gpt-4o",
  systemPrompt: "You are a UI/UX designer focused on clean, modern design.",
  tools: ["file", "browser"],
});

// ViberAgent orchestrates the team
const viber = await ViberAgent.start("Build a landing page", {
  model: "anthropic/claude-3.5-sonnet",
  team: [developer, designer],
});
```

## Task Flow

1. **Intake**: ViberAgent receives goal from manager
2. **Planning**: Breaks goal into tasks, identifies dependencies
3. **Delegation**: Assigns tasks to appropriate worker agents
4. **Execution**: Workers execute tasks using their tools/skills
5. **Review**: ViberAgent reviews results, handles failures
6. **Reporting**: Reports progress with evidence to manager

## Working Modes

ViberAgent supports three autonomy levels:

| Mode | Behavior |
|------|----------|
| **Always Ask** | Asks manager before each significant action |
| **Agent Decides** | Acts within policy boundaries, asks when uncertain |
| **Always Execute** | Maximum autonomy, human intervenes by exception |

## Intervention Points

The manager can intervene at any time:

- **Chat**: "Stop working on X, prioritize Y instead"
- **Terminal**: Observe real-time execution via tmux streaming
- **Approval**: Sensitive actions pause for human approval

## Budget-Aware Execution

ViberAgent tracks costs and respects limits:

- Evaluates remaining budget before expensive calls
- Prefers lower-cost models when quality allows
- Pauses execution when approaching limits
- Reports budget usage in status updates

## Evidence-Based Verification

All work must be verifiable:

- Terminal logs and command outputs
- Screenshots of UI changes
- URLs and artifact paths
- Step-by-step reproduction instructions

No claim is complete without evidence a human can verify.
