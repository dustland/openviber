---
title: "Tools"
description: "Actions that agents can take to accomplish tasks"
---

# Tools

**Tools** are the actions that agents can take to interact with the world. They're how agents move from thinking to doing.

## What Are Tools?

When you ask an agent to "create a file", it uses a **file tool**. When you ask it to "search the web", it uses a **search tool**. Tools are the bridge between AI reasoning and real-world actions.

Think of tools like apps on your phone — each one does something specific, and together they let you accomplish many different tasks.

## Built-in Tools

OpenViber comes with several tools ready to use:

| Tool | What It Does |
|------|--------------|
| **File** | Read, write, create, and delete files |
| **Terminal** | Run shell commands and scripts |
| **Browser** | Navigate web pages, click, type, extract content |
| **Search** | Find information online |
| **Desktop** | Interact with desktop applications |

## How Agents Use Tools

When an agent decides to use a tool:

1. It selects the appropriate tool for the task
2. Provides the necessary inputs (like a filename or search query)
3. Executes the action
4. Receives the result and continues reasoning

You can observe this process in real-time through the Viber Board.

## Tool Permissions

For safety, tools can be restricted:

- **Allowed tools** — Only these tools can be used
- **Blocked tools** — These tools are never used
- **Approval required** — Agent asks before using these tools

This lets you control the blast radius of agent actions.

## Custom Tools

Skills can provide specialized tools for specific domains. For example, an "antigravity" skill might include a tool for checking IDE health and auto-recovering from errors.

See [Skills](/docs/concepts/skills) for how domain knowledge bundles tools with instructions.

## Next Steps

- [Skills](/docs/concepts/skills) — Domain knowledge that includes specialized tools
- [Agents](/docs/concepts/agents) — How agents use tools
- [Security](/docs/design/security) — Tool permissions and safety
