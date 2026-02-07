---
description: how to run the openviber web app dev server
---

## Dev Server

The web app is in `web/` and uses SvelteKit + Vite.

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
