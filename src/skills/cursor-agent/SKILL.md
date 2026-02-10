---
name: cursor-agent
version: 3.0.0
description: Use the Cursor CLI (agent) for software engineering tasks. Includes installation, auth, commands, tmux-based automation, and best practices for AI coding workflows.
author: Pushpinder Pal Singh
playground:
  repo: dustland/openviber
  file: src/skills/cursor-agent/index.ts
---

# Cursor CLI Agent Skill

This skill provides expert knowledge for using the Cursor CLI (`agent` / `cursor-agent`). When the user asks to use this skill or run the Cursor CLI, use your available tools (their descriptions tell you when to call them). When running the Cursor CLI from automation you **must** use tmux — direct execution without a TTY will hang.

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

## Best Practices for AI Coding Tasks

### Writing Effective Prompts

The quality of the Cursor agent's output depends heavily on the prompt. Follow these guidelines:

1. **Be specific about files and locations:**
   - BAD: "Fix the bug in the auth module"
   - GOOD: "In src/auth/login.ts, the loginUser() function throws an unhandled promise rejection when the database connection times out. Add proper error handling with a try/catch block and return a meaningful error response."

2. **Include context about the codebase:**
   - Mention the framework (React, Next.js, Express, etc.)
   - Mention the language (TypeScript strict mode, Python 3.12, etc.)
   - Reference relevant patterns: "This project uses the repository pattern for data access"

3. **State acceptance criteria:**
   - "Ensure all existing tests pass after the change"
   - "The function should handle null inputs gracefully"
   - "Follow the existing code style (no semicolons, 2-space indent)"

4. **For coding tasks that make changes, include git workflow instructions:**
   - **Create a branch first:** "Create a branch named fix/auth-error-handling"
   - **Commit and push when done:** "When complete, commit the changes with message 'fix: add error handling to login function', push the branch to origin"
   - **Create a PR:** "Create a pull request with title 'Fix: Add error handling to login function' and body describing the changes"
   - Example full prompt: "Create a branch named fix/auth-error-handling. In src/auth/login.ts, add proper error handling to the loginUser() function. When complete, commit with message 'fix: add error handling to login function', push the branch, and create a pull request titled 'Fix: Add error handling to login function'."

5. **For multi-step tasks, break them down:**
   - Run one focused prompt per logical change
   - Verify after each step before proceeding
   - Use `agent -p` (non-interactive) for automated workflows

### Configuring Rules and Context

Cursor agent reads rules from these locations (in order):
- `.cursor/rules` — Project-specific rules directory
- `AGENTS.md` — Agent instructions at project root
- `CLAUDE.md` — Claude-specific instructions at project root
- `.cursorrules` — Legacy rules file

**Best practice:** Create an `AGENTS.md` in the project root with:
- Project structure overview
- Coding conventions
- Testing requirements
- Deployment notes

### MCP Integration

Cursor agent supports MCP (Model Context Protocol) servers defined in `mcp.json`:
- Enable/disable with `/mcp` in interactive session
- MCP servers can provide additional tools and context

## Using Cursor CLI from Automation (Viber / AI agents)

**CRITICAL:** The Cursor CLI requires a real TTY. Running `agent` or `agent -p "..."` directly from a subprocess or script will hang indefinitely.

**Solution: run inside tmux.** The **tmux** skill documents how to install and use tmux; use **tmux_install_check** first and if tmux is not installed, tell the user to install it (e.g. `brew install tmux` or `sudo apt install tmux`).

1. **Install tmux** if needed (see **tmux** skill or run `tmux_install_check`).
2. **cursor_agent_run** runs the agent inside a tmux session with automatic completion detection.
3. For custom flows: create a detached session, send keys, wait, capture pane (see tmux skill).

**What does NOT work:** Running `agent "task"` or `agent -p "task"` directly from Node/scripts without a PTY — it will hang.

### Tool: cursor_agent_run

The `cursor_agent_run` tool:
- Runs the Cursor agent in a tmux session with a specified prompt
- **Polls for completion** instead of blindly waiting a fixed duration
- Returns structured output with status, timing, and captured terminal output
- Supports parallel runs via distinct `sessionName` values

**Parameters:**
- `goal` (required): Detailed task prompt — be specific (see best practices above)
- `cwd` (optional): Project root directory
- `waitSeconds` (optional): Maximum wait time (default: 120s, polls every 3s)
- `sessionName` (optional): Tmux session name for parallel runs (default: 'cursor-agent')

**Return shape:**
- `ok`: boolean — whether the agent completed within the time limit
- `status`: 'completed' | 'timed_out' | 'error'
- `summary`: one-line status string
- `outputTail`: last ~100 lines of terminal output (chat-friendly)
- `output`: full captured output (truncated if very large)
- `elapsed`: seconds spent
- `hint`: guidance when timed out or errored

### Parallel Cursor Agent Runs

For large tasks, run multiple agents in parallel with distinct session names:

```
cursor_agent_run({ goal: "Fix auth module tests", cwd: "/project", sessionName: "cursor-auth" })
cursor_agent_run({ goal: "Update API documentation", cwd: "/project", sessionName: "cursor-docs" })
```

Check status of all sessions with `tmux_list`.

## Recommended Workflows

### Issue Fix Workflow

1. `gh_get_issue` → Read the full issue
2. `gh_clone_repo` → Clone (or pull latest)
3. `cursor_agent_run` → Fix the issue with a prompt that includes:
   - Issue details and requirements
   - Instructions to create a branch (e.g., "Create a branch named fix/issue-123")
   - Instructions to commit, push, and create a PR when done
   - Example: "Create a branch named fix/issue-123. Fix the bug described in issue #123: [issue details]. When complete, commit with message 'fix: resolve issue #123', push the branch, and create a pull request titled 'Fix: [issue title]' that references issue #123."

**Note:** The Cursor agent can execute git commands directly, so you don't need separate `gh_create_branch`, `gh_commit_and_push`, or `gh_create_pr` calls. Just include these instructions in the prompt to `cursor_agent_run`.

### Code Review Workflow

```
agent -p 'Review the changes in the current branch against main. Focus on security and performance.'
```

### Refactor Workflow

```
agent -p 'Refactor src/utils.ts to reduce complexity and improve type safety. Ensure all tests pass.'
```

### Debug Workflow

```
agent -p 'Analyze the following error and suggest a fix: [paste error]. The error occurs in src/api/handler.ts.'
```

## Rules & MCP

- Rules load from `.cursor/rules`, `AGENTS.md`, `CLAUDE.md`.
- MCP servers from `mcp.json`; enable/disable with `/mcp` in session.
