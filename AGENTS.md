# Agent Instructions

Guidelines for AI agents working on the OpenViber codebase.

## Package Management

- **Always use `pnpm`** for installing dependencies and running scripts. Do not use `npm` or `yarn`.

## Code Style

- Use TypeScript for all source code
- Follow existing code patterns and naming conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

## UI Components (Web)

- **Always use [shadcn-svelte](https://next.shadcn-svelte.com/) components** for the web UI. Install new components via the CLI: `pnpm dlx shadcn-svelte@latest add <component>` (run from the `web/` directory).
- **Prefer DropdownMenu over native `<select>`** for all selection/filter controls. Native `<select>` elements should be avoided in favor of the styled DropdownMenu component from shadcn-svelte.
- Before building a custom component, check if shadcn-svelte already provides one (e.g., Dialog, Pagination, DropdownMenu, Tabs, etc.).

## Project Structure

```
src/
├── core/           # Core classes (Agent, Viber, etc.)
├── daemon/         # Daemon runtime and controller
├── channels/       # Communication channels (web, dingtalk, wecom)
├── skills/         # Skill implementations
├── tools/          # Tool implementations
└── utils/          # Utility functions

docs/
├── design/         # Architecture and design documents
├── concepts/       # Concept explanations
└── reference/      # API and config references
```

## Architecture Documentation

For architectural decisions and design patterns, refer to the design docs:

- `docs/design/arch.md` - System architecture
- `docs/design/communication.md` - Messaging and protocols
- `docs/design/task-lifecycle.md` - Task states and flow
- `docs/design/plan-and-artifacts.md` - Plan and artifact management
- `docs/design/memory.md` - Memory architecture
- `docs/design/personalization.md` - Three-file personalization pattern
- `docs/design/error-handling.md` - Error handling strategies

## Key Conventions

### ~/.openviber/

The standard location for viber configuration and working state:

```
~/.openviber/
├── soul.md               # Agent personality and communication style
├── user.md               # User context and preferences
├── memory.md             # Curated long-term memory
├── memory/               # Daily logs (auto-generated)
│   └── YYYY-MM-DD.md
├── agents/               # Agent configurations
│   └── default.yaml
├── tasks/                # Active task state
└── artifacts/            # Task artifacts
```

### Three-File Personalization Pattern

The daemon loads three markdown files that define agent behavior:

1. **soul.md** - Personality, communication style, operational boundaries
2. **user.md** - User context, current projects, preferences
3. **memory.md** - Persistent memory, learned patterns, decisions

These files are injected into every request as context. See `docs/design/personalization.md` for the full specification.

**Implementation guidance**:
- Load files in `src/daemon/runtime.ts` via `loadPersonalization()`
- Inject as `<soul>`, `<user>`, `<memory>` blocks in system prompt
- Add `memory_log` tool for agent-initiated memory updates
- Files are config (static per-machine), not conversation state

### Daemon Path

The daemon (`viber start`) is the main runtime path:

- Entry point: `src/daemon/controller.ts`
- Task execution: `src/daemon/runtime.ts`
- Agent config loading: Uses `getViberPath()` from `src/config.ts`

### Testing

- Run tests with `pnpm test`
- Type check with `pnpm tsc --noEmit`
- Integration tests are in `*.integration.test.ts` files

### Local Dev URLs (Do Not Guess)

- Web app default: `http://localhost:6006`
- Hub REST API: `http://localhost:6007`
- Hub WebSocket: `ws://localhost:6007/ws`
- Viber local WebSocket: `ws://localhost:6008`
- Before any browser test, verify active ports from `/Users/hugh/.cursor/projects/Users-hugh-dustland-openviber/terminals/1.txt`.
- Never assume Vite default port `5173` in this workspace.

## Git Workflow

- Create feature branches from `main`
- Use descriptive commit messages
- Reference issues in commits when applicable
