---
name: cursor-agent
version: 2.1.0
description: Use the Cursor CLI (agent) for software engineering tasks. Includes installation, auth, commands, and tmux-based automation for AI/agent invocation.
author: Pushpinder Pal Singh
---

# Cursor CLI Agent Skill

This skill provides expert knowledge for using the Cursor CLI (`agent` / `cursor-agent`). When the user asks to use this skill or run the Cursor CLI, use your available tools (their descriptions tell you when to call them). When running the Cursor CLI from automation you **must** use tmux—direct execution without a TTY will hang.

## Installation & Setup

**Install (macOS/Linux/WSL):**

```bash
curl https://cursor.com/install -fsS | bash
```

**macOS (Homebrew):** `brew install --cask cursor-cli`

**PATH:** Add `$HOME/.local/bin` to PATH in `~/.zshrc` or `~/.bashrc`, then `source` it.

**Verify:** `agent --version` or `cursor-agent --version`

## Authentication

- **Interactive:** `agent login`
- **API key:** `export CURSOR_API_KEY=your_api_key_here`

## Commands (user-facing)

- **Interactive:** `agent` or `agent "Add error handling to this API"`
- **Non-interactive / CI:** `agent -p 'Run tests and report coverage'` or `agent --print 'Refactor this file'`
- **Models:** `agent models` or `agent --model gpt-5`
- **Sessions:** `agent ls`, `agent resume`, `agent --resume="[chat-id]"`

## Slash commands (inside interactive session)

- `/models` – switch models
- `/compress` – summarize conversation
- `/rules` – edit rules
- `/commands` – custom commands
- `/mcp enable|disable [server-name]` – MCP

## Using Cursor CLI from automation (viber / AI agents)

**CRITICAL:** The Cursor CLI requires a real TTY. Running `agent` or `agent -p "..."` directly from a subprocess or script will hang indefinitely.

**Solution: run inside tmux.** The **tmux** skill documents how to install and use tmux; use **tmux_install_check** first and if tmux is not installed, tell the user to install it (e.g. `brew install tmux` or `sudo apt install tmux`).

1. **Install tmux** if needed (see **tmux** skill or run `tmux_install_check`).
2. **cursor_agent_run** already runs the agent inside a tmux session.
3. For custom flows: create a detached session, send keys, wait, capture pane (see tmux skill).

**What does NOT work:** Running `agent "task"` or `agent -p "task"` directly from Node/scripts without a PTY—it will hang.

When the user or the system asks to "use Cursor agent" or "run Cursor CLI" for a coding task, use the **cursor_agent_run** tool (which runs the agent inside tmux) or instruct the user to run the agent in a terminal. Do not invoke `agent` directly from a subprocess without tmux.

## Workflows

- **Code review:** `agent -p 'Review the changes in the current branch against main. Focus on security and performance.'`
- **Refactor:** `agent -p 'Refactor src/utils.ts to reduce complexity and improve type safety.'`
- **Debug:** `agent -p 'Analyze the following error log and suggest a fix: [paste log]'`
- **Git:** `agent -p 'Generate a commit message for the staged changes (conventional commits).'`

## Rules & MCP

- Rules load from `.cursor/rules`, `AGENTS.md`, `CLAUDE.md`.
- MCP servers from `mcp.json`; enable/disable with `/mcp` in session.
