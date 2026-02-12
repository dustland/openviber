# Agent Instructions

Guidelines for AI agents working on the OpenViber codebase.

## Package Management

- **Always use `pnpm`** for installing dependencies and running scripts.
- Do not use `npm` or `yarn`.

## Code Style

- Use TypeScript for source code.
- Follow existing naming and architectural patterns.
- Add JSDoc comments for public APIs.
- Prefer small, focused changes over broad rewrites.

## UI Components (Web)

- **Always use [shadcn-svelte](https://next.shadcn-svelte.com/) components** for web UI work.
- Install components with:
  - `cd web && pnpm dlx shadcn-svelte@latest add <component>`
- **Prefer DropdownMenu over native `<select>`** for selection/filter controls.
- Before building a custom component, check if shadcn-svelte already provides it.
- **No `mr-2` on icons inside buttons.** Use the parent container's `gap` (e.g. `gap-2`) for spacing between icon and label.

## Project Structure

```text
src/
├── cli/            # CLI entrypoints
├── daemon/         # Runtime, controller, scheduler, gateway/hub
├── gateway/        # Central coordinator (REST + WebSocket)
├── channels/       # Channel integrations (web, dingtalk, wecom, discord)
├── skills/         # Skill implementations and registry
├── tools/          # Built-in tools (shell, file, browser, etc.)
├── viber/          # Agent, provider, config, context, task, plan, tool abstractions
├── types/          # Shared types
└── utils/          # Shared utilities

docs/
├── design/         # Architecture and protocol docs
├── concepts/       # Concept explanations
├── guides/         # Practical guides
├── reference/      # Config/schema references
└── getting-started/# Onboarding docs

web/
└── src/            # SvelteKit frontend
```

## Architecture Documentation

When making architectural changes, read relevant docs in `docs/design/` first:

- `viber.md` - Node and viber architecture
- `communication.md` - Messaging and communication model
- `protocol.md` - Protocol-level behavior
- `task-lifecycle.md` - Task states and transitions
- `context-management.md` - Context composition strategy
- `memory.md` - Memory model
- `personalization.md` - Three-file personalization pattern
- `mcp-integration.md` - MCP integration approach
- `streaming.md` - Streaming behavior and events
- `error-handling.md` - Failure handling conventions
- `security.md` - Security boundaries
- `environments-and-threads.md` - Environment/thread semantics

## Key Runtime Conventions

### `~/.openviber/` layout

OpenViber runtime state is rooted at `~/.openviber/` by default.

```text
~/.openviber/
├── user.md                         # Shared user context
├── soul.md                         # Optional root fallback soul
├── memory.md                       # Optional root fallback memory
├── vibers/
│   └── <viberId>/
│       ├── soul.md                 # Per-viber soul
│       ├── memory.md               # Per-viber memory
│       └── memory/
│           └── YYYY-MM-DD.md       # Daily memory logs
├── agents/
│   └── default.yaml                # Agent config
├── tasks/                          # Task state
└── artifacts/                      # Task artifacts
```

### Three-file personalization pattern

`loadPersonalization()` in `src/daemon/runtime.ts` composes:

1. `soul.md` (per-viber, then root fallback)
2. `user.md` (shared root-level)
3. `memory.md` (per-viber, then root fallback)

The daemon injects these as `<soul>`, `<user>`, and `<memory>` blocks in prompts.

## Development and Validation

Core commands:

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm test` (watch mode)
- `pnpm test:run` (CI style)
- `pnpm typecheck`
- `pnpm verify:skills`

Testing expectations:

- Add or update tests when behavior changes.
- Integration tests use `*.integration.test.ts`.
- For targeted work, run the narrowest relevant tests first, then broader checks.

### E2E Test Mode (AI Agent Testing)

The web app supports an **E2E test mode** that bypasses OAuth and onboarding, allowing AI agents (Cursor, Codex, Playwright, etc.) to test the full UI without real GitHub credentials.

**How to enable:**
1. Set `E2E_TEST_MODE=true` in `web/.env`
2. Restart the dev server (`pnpm dev` in `web/`)

**What it does:**
- Injects a synthetic test user (`E2E Test User`) for all unauthenticated requests to protected routes
- Skips the onboarding completion gate entirely
- Shows a small amber banner at the top of every page: "E2E Test Mode"
- The test-session status can be verified: `GET /auth/test-session`

**Safety:** The flag is ignored when `NODE_ENV=production`.

**For AI agents — before running browser tests:**
1. Verify test mode is active: `curl http://localhost:6006/auth/test-session`
2. Navigate directly to any protected route (e.g., `/vibers`, `/settings`) — no login needed

## Local Dev URLs (Do Not Guess)

- Web app default: `http://localhost:6006`
- Gateway REST API: `http://localhost:6007`
- Gateway WebSocket: `ws://localhost:6007/ws`
- Viber local WebSocket: `ws://localhost:6008`
- Never assume Vite default port `5173` in this workspace.
- Before browser testing, verify active ports from Cursor terminal logs under:
  - `~/.cursor/projects/<workspace>/terminals/`

## Git Workflow

- Work from feature branches created from `main`.
- Use descriptive commit messages.
- Reference issues in commits when applicable.
