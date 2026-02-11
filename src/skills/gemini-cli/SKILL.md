---
name: gemini-cli
version: 1.0.0
description: Run Google Gemini CLI for autonomous coding and general tasks via headless mode with chat-friendly outputs.
---

# Gemini CLI Skill

Run Google Gemini CLI (`gemini`) from Viber for autonomous coding and general tasks. This skill uses headless mode (`gemini -p "<prompt>"`), which works reliably from Node/AI SDK tool calls and web UI chat workflows.

## Installation

Install Gemini CLI globally:

```bash
pnpm add -g @google/gemini-cli
```

Then authenticate (one of):

```bash
# Browser-based login (interactive)
gemini

# Or set API key for headless environments
export GEMINI_API_KEY=your-key-here
```

## Tool

- **`gemini_run`** — Runs Gemini CLI with a prompt, returns:
  - `summary` (status, cwd, mode, exit code)
  - `stdoutTail` and `stderrTail` (chat-friendly tail output)
  - `output` (truncated combined output for deeper follow-up)

## Why this is web-UI friendly

- Produces compact response tails so users can quickly see what happened.
- Keeps large command output bounded to protect context windows.
- Returns structured fields (`ok`, `summary`, `error`, `exitCode`, `command`) for robust assistant follow-up.
- Validates environment early (Gemini CLI installed, cwd exists) with clear user-facing errors.

## Parameters

- `prompt` (required): task for Gemini
- `cwd` (optional): target working directory (must exist)
- `waitSeconds` (optional): timeout in seconds (default `120`, minimum `10`)
- `approvalMode` (optional):
  - `yolo` (default): `--yolo` — auto-approve all actions
  - `default`: normal interactive mode (no special flags)
- `model` (optional): override model (e.g. `gemini-2.5-pro`, `gemini-2.5-flash`)
- `outputFormat` (optional): `text` (default) or `json` for structured output

## Usage from Viber

Use this skill when user intent is:

- "use gemini"
- "run gemini cli on this task"
- "delegate this to gemini"

Examples:

```ts
gemini_run({
  prompt: "Fix failing tests in src/skills/gemini-cli.test.ts",
  cwd: "/workspace/openviber",
  approvalMode: "yolo",
})
```

```ts
gemini_run({
  prompt: "Review this repo and suggest improvements",
  approvalMode: "default",
  waitSeconds: 180,
  model: "gemini-2.5-pro",
})
```

## Recommended follow-up behavior in chat

After calling `gemini_run`:

1. Show `summary` first.
2. Include important lines from `stdoutTail` / `stderrTail`.
3. If failed, use `error` + `command` to explain next action.
4. Ask user whether to re-run with different `approvalMode`, `model`, or `cwd`.

## Authentication

Gemini CLI supports multiple auth methods:
- **Google account** (browser login) — best for local dev
- **`GEMINI_API_KEY` env var** — best for headless/CI environments
- **Google Cloud ADC** — for enterprise setups

If you have a Google Ultra subscription, Gemini CLI will use your subscription's quota automatically when authenticated via Google account.
