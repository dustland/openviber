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

For terminal automation, OpenViber uses the **tmux skill** (`tmux`, `cursor-agent`) rather than a standalone terminal tool.

| Tool | What It Does |
|------|--------------|
| **File** | Read, write, create, and delete files |
| **Search** | Find information online |
| **Web** | Fetch, parse, and crawl web content |
| **Browser** | Navigate web pages, click, type, and extract content |
| **Desktop** | Interact with desktop applications |
| **Schedule** | Create, list, and manage recurring job schedules |
| **Notify** | Send desktop notifications for important events |

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

## Skill-Provided Tools

Skills can bundle specialized tools for specific domains. When a skill is loaded, its tools become available alongside the built-in tools. For example:

| Skill | Tools Provided |
|-------|---------------|
| **antigravity** | `antigravity_check_and_heal` — detect and recover from IDE errors |
| **cursor-agent** | `cursor_agent_run` — run Cursor CLI in tmux |
| **codex-cli** | `codex_run` — run Codex CLI non-interactively |
| **github** | `gh_list_issues`, `gh_get_issue`, `gh_clone_repo`, `gh_create_branch`, `gh_commit_and_push`, `gh_create_pr` |
| **tmux** | `tmux_install_check`, `tmux_new_session`, `tmux_new_window`, `tmux_split_pane`, `tmux_send_keys`, `tmux_list`, `tmux_run` |

Skill tools follow the same `CoreTool` interface (Zod input schema + async execute function) as built-in tools. See [Skills](/docs/concepts/skills) for details on how skills bundle tools with domain knowledge.

## Custom Tools

You can create custom tools by writing a skill with an `index.ts` that exports a `getTools()` function. This keeps tools bundled with their domain context and makes them easy to share.

## Next Steps

- [Skills](/docs/concepts/skills) — Domain knowledge bundles with specialized tools
- [Jobs](/docs/concepts/jobs) — Scheduled tasks that use tools
- [Viber](/docs/concepts/viber) — How vibers use tools
- [Security](/docs/design/security) — Tool permissions and safety
