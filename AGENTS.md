# Agent Instructions

Guidelines for AI agents working on the OpenViber codebase.

## Package Management

- **Always use `pnpm`** for installing dependencies and running scripts. Do not use `npm` or `yarn`.

## Code Style

- Use TypeScript for all source code
- Follow existing code patterns and naming conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

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
- `docs/design/error-handling.md` - Error handling strategies

## Key Conventions

### ~/.openviber/

The standard location for viber configuration and working state:

- `~/.openviber/agents/{id}.yaml` - Agent configurations
- `~/.openviber/tasks/` - Active task state
- `~/.openviber/artifacts/` - Task artifacts

### Daemon Path

The daemon (`viber start`) is the main runtime path:

- Entry point: `src/daemon/controller.ts`
- Task execution: `src/daemon/runtime.ts`
- Agent config loading: Uses `getViberPath()` from `src/config.ts`

### Testing

- Run tests with `pnpm test`
- Type check with `pnpm tsc --noEmit`
- Integration tests are in `*.integration.test.ts` files

## Git Workflow

- Create feature branches from `main`
- Use descriptive commit messages
- Reference issues in commits when applicable
