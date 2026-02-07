---
name: codex-cli
version: 1.0.0
description: Run OpenAI Codex CLI for autonomous software engineering tasks. Requires tmux for PTY.
---

# Codex CLI Skill

Run the OpenAI Codex CLI (`codex`) from the viber for autonomous coding tasks. Codex CLI, like Cursor agent, **requires a real TTY** and must run inside tmux.

## Installation

**Install Codex CLI:**

```bash
npm install -g @openai/codex
```

**Verify:** `codex --version`

**Requires:** tmux (see `tmux` skill for installation).

## Tools

- **codex_run** — Run Codex CLI with a prompt inside a tmux session. Returns captured output after a configurable wait.

## Usage from viber

When the user asks to "use codex", "run codex", or assigns a coding task that should be handled by Codex CLI, use **codex_run**. Pass the task as the `prompt` parameter.

Example prompts:
- `codex_run({ prompt: "Fix the failing test in src/utils.test.ts", cwd: "/path/to/repo" })`
- `codex_run({ prompt: "Add error handling to the API endpoint in server.ts", cwd: "/path/to/repo" })`

## Approval mode

By default, Codex runs in `--full-auto` mode (no human confirmation needed for file writes). This is appropriate for autonomous workflows. For interactive use, the user can override via the `approvalMode` parameter.

## When to use

- Fixing bugs or implementing features autonomously
- As part of an automated pipeline: fetch issue → clone repo → run codex → commit → PR
- When the user specifically asks for Codex CLI
