---
name: codex-cli
version: 1.0.0
description: Run OpenAI Codex CLI for autonomous software engineering tasks via non-interactive `codex exec`.
---

# Codex CLI Skill

Run the OpenAI Codex CLI (`codex`) from the viber for autonomous coding tasks. This skill uses `codex exec` (non-interactive), so it works directly from Node/AI SDK tool calls without tmux.

## Installation

**Install Codex CLI:**

```bash
npm install -g @openai/codex
```

**Verify:** `codex --version`

## Tools

- **codex_run** — Run Codex CLI with a prompt using `codex exec`. Returns command output, exit status, and errors for follow-up reasoning.

## Usage from viber

When the user asks to "use codex", "run codex", or assigns a coding task that should be handled by Codex CLI, use **codex_run**. Pass the task as the `prompt` parameter.

Example prompts:
- `codex_run({ prompt: "Fix the failing test in src/utils.test.ts", cwd: "/path/to/repo" })`
- `codex_run({ prompt: "Add error handling to the API endpoint in server.ts", cwd: "/path/to/repo" })`

## Approval mode

`codex_run` exposes `approvalMode`:
- `full-auto` (default): runs Codex with `--full-auto`
- `auto-edit`: writable workspace mode (without forcing `--full-auto`)
- `suggest`: read-only suggestions (no file edits)

## When to use

- Fixing bugs or implementing features autonomously
- As part of an automated pipeline: fetch issue → clone repo → run codex → commit → PR
- When the user specifically asks for Codex CLI
