---
name: codex-cli
version: 1.1.0
description: Run OpenAI Codex CLI for autonomous software engineering tasks via non-interactive `codex exec` with chat-friendly outputs.
---

# Codex CLI Skill

Run OpenAI Codex CLI (`codex`) from Viber for autonomous coding tasks. This skill uses `codex exec` (non-interactive), which works reliably from Node/AI SDK tool calls and web UI chat workflows.

## Installation

Install Codex CLI globally:

```bash
pnpm add -g @openai/codex
```

Then authenticate:

```bash
codex login
codex --version
```

## Tool

- **`codex_run`** — Runs Codex CLI with a prompt, returns:
  - `summary` (status, cwd, mode, exit code)
  - `stdoutTail` and `stderrTail` (chat-friendly tail output)
  - `output` (truncated combined output for deeper follow-up)

## Why this is web-UI friendly

- Produces compact response tails so users can quickly see what happened.
- Keeps large command output bounded to protect context windows.
- Returns structured fields (`ok`, `summary`, `error`, `exitCode`, `command`) for robust assistant follow-up.
- Validates environment early (Codex installed, cwd exists) with clear user-facing errors.

## Parameters

- `prompt` (required): task for Codex
- `cwd` (optional): target working directory (must exist)
- `waitSeconds` (optional): timeout in seconds (default `90`, minimum `10`)
- `approvalMode` (optional):
  - `full-auto` (default): `--full-auto`
  - `auto-edit`: writable workspace mode
  - `suggest`: read-only suggestions
- `model` (optional): override model (for example `gpt-5-codex`)

## Usage from Viber

Use this skill when user intent is:

- “use codex”
- “run codex on this task”
- “delegate this coding task to codex”

Examples:

```ts
codex_run({
  prompt: "Fix failing tests in src/skills/codex-cli.test.ts",
  cwd: "/workspace/openviber",
  approvalMode: "auto-edit",
})
```

```ts
codex_run({
  prompt: "Review this repo and propose a migration plan",
  approvalMode: "suggest",
  waitSeconds: 120,
})
```

## Recommended follow-up behavior in chat

After calling `codex_run`:

1. Show `summary` first.
2. Include important lines from `stdoutTail` / `stderrTail`.
3. If failed, use `error` + `command` to explain next action.
4. Ask user whether to re-run with different `approvalMode`, `model`, or `cwd`.


## Testing long or complex Codex tasks

For real-world flows (for example multi-step repo analysis or issue-fix planning), use opt-in live tests:

```bash
OPENVIBER_RUN_LIVE_CLI_TESTS=1 pnpm test src/skills/codex-cli.integration.test.ts
OPENVIBER_RUN_LIVE_CLI_COMPLEX_TESTS=1 pnpm test src/skills/codex-cli.integration.test.ts
```

Notes:
- Complex live tests are `suggest` mode (read-only) by default for safety.
- They may still fail if `codex login` has not been completed in the environment.
- Even on failure, return shape remains structured (`summary`, `error`, tails) for UI resilience checks.
