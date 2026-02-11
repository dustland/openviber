---
description: how to run the openviber web app dev server
---

## Dev Server

The web app is in `web/` and uses SvelteKit + Vite.

### Prerequisites

The `pnpm dev` command automatically:
- Creates `~/.openviber/agents/default.yaml` if it doesn't exist (via `scripts/dev-setup.ts`)

You'll need to log in via GitHub OAuth at `http://localhost:6006/login` on first use.

// turbo
1. Start the full dev stack from the project root:
```bash
pnpm dev
```

This starts 3 services:
- **Web UI** on port **6006** (web/ SvelteKit app)
- **Hub server** on port **6007** (daemon)
- **Hub WS** on port **6008** (WebSocket relay)

// turbo
2. Open the web app in browser:
```
http://localhost:6006
```

> **Note:** The port is configured in `web/vite.config.ts` as `port: 6006`. It is NOT the Vite default 5173.

### Individual Services

Run services separately if needed:
```bash
pnpm dev:gateway  # Gateway only (or pnpm dev:hub for deprecated alias)
pnpm dev:web    # Web UI only
pnpm dev:viber  # Viber daemon only
pnpm dev:setup  # Re-run setup (create default agent config)
```
