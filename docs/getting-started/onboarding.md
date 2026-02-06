# Onboarding

Set up OpenViber on your machine with automated configuration.

## Prerequisites

- Node.js 18 or later
- pnpm (recommended) or npm

## Quick Setup

Run the onboard command to create your config:

```bash
npx openviber onboard
```

This creates:
- `~/.openviber/agents/default.yaml` — Default agent configuration
- `~/.openviber/jobs/` — Directory for scheduled tasks
- `~/.openviber/space/` — Space files

## Set Your API Key

OpenViber uses OpenRouter by default for access to multiple models:

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys)

## Start Your Viber

```bash
openviber start
```

For terminal-first usage, keep interacting in your shell.

For the Viber Board web UI, run `pnpm dev:web` in a second terminal and open http://localhost:6006.

## Alternative: Global Install

Install the CLI globally for easier access:

```bash
pnpm add -g openviber
```

## Verify

Check your setup:

```bash
openviber status
```

## Next Steps

- [Quick Start](/docs/getting-started/quick-start) — Run your first task
- [Agents](/docs/concepts/agents) — Customize agent behavior
- [Jobs](/docs/concepts/jobs) — Set up scheduled tasks
