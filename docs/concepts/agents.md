---
title: "Agents"
description: "AI workers that execute tasks on your behalf"
---

# Agents

An **agent** is an AI that can reason, plan, and take actions to accomplish tasks. In OpenViber, agents are the workers that execute your requests using tools and skills.

## How Agents Work

When you give a task to your viber, an agent:

1. **Understands** your request and any relevant context
2. **Plans** the steps needed to accomplish the goal
3. **Executes** those steps using available tools
4. **Reports** progress and results back to you

## Agent Types

OpenViber supports different agent configurations for different purposes:

| Type | Purpose | Example |
|------|---------|---------|
| **General** | Handles broad tasks | "Research AI trends and summarize" |
| **Developer** | Writes and edits code | "Build a landing page" |
| **Researcher** | Gathers and synthesizes information | "Compare cloud providers" |
| **Custom** | Domain-specific tasks | "Monitor IDE errors and auto-recover" |

## What Agents Can Do

Agents gain capabilities through **tools** (actions they can take):

- **File operations** — Read, write, create files
- **Terminal** — Run commands, scripts
- **Browser** — Navigate web pages, extract content
- **Search** — Find information online

And **skills** (knowledge about specific domains):

- How to use specific frameworks
- Best practices for certain tasks
- Recovery procedures for errors

## Working Modes

Agents can operate at different autonomy levels:

| Mode | Behavior |
|------|----------|
| **Always Ask** | Agent asks before each action |
| **Agent Decides** | Acts on routine tasks, asks on risky ones |
| **Always Execute** | Maximum autonomy, minimal interruption |

## Agent Configuration

Agents are configured through YAML files. You define:

- **Name** — What to call this agent
- **Purpose** — What it's designed to do
- **Model** — Which AI model to use (Claude, GPT, etc.)
- **Tools** — What actions it can take
- **Skills** — What domain knowledge it has

See [Getting Started](/docs/getting-started/quick-start) for how to configure agents.

## Next Steps

- [Tools](/docs/concepts/tools) — Actions agents can take
- [Skills](/docs/concepts/skills) — Domain knowledge for agents
- [Memory](/docs/concepts/memory) — How agents remember context
