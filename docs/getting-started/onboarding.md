# Onboarding

Set up an OpenViber node on your machine.

## Option A: Connect to a Board (Recommended)

If you have an OpenViber Board, the fastest path is:

1. Log in to your OpenViber Board
2. Click **"Add Node"**
3. Copy the generated command
4. Run it on your machine:

```bash
npx openviber connect --token eyJub2RlIjoiYTFiMmMz...
```

This single command:
- Installs/updates OpenViber
- Creates `~/.openviber/` with your node config
- Registers the node with the Board
- Starts the node runtime

The token is one-time-use and expires after 15 minutes. After connecting, the node communicates outbound to the Board — no inbound ports needed.

## Option B: Standalone Setup

For local-only use without a Board:

```bash
npx openviber onboard
```

This creates:
- `~/.openviber/config.yaml` — Node configuration
- `~/.openviber/user.md` — Shared user context
- `~/.openviber/vibers/default.yaml` — Default viber config
- `~/.openviber/vibers/default/soul.md` — Viber persona
- `~/.openviber/vibers/default/memory.md` — Long-term memory

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

## File Structure After Setup

```
~/.openviber/                    # Config (small, portable)
├── config.yaml                  # Provider keys, daemon settings
├── user.md                      # Who you are (shared)
└── vibers/
    └── default/
        ├── soul.md              # Viber's persona
        └── memory.md            # Long-term memory

~/openviber_spaces/              # Working data (created as needed)
└── (vibers clone and create spaces here)
```

## Verify

Check your setup:

```bash
openviber status
```

## Next Steps

- [Quick Start](/docs/getting-started/quick-start) — Run your first task
- [Viber](/docs/concepts/viber) — Customize viber behavior
- [Jobs](/docs/concepts/jobs) — Set up scheduled tasks
