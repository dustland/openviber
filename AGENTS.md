# Agent Instructions

## Package Management

- **Always use `pnpm`** for installing dependencies and running scripts. Do not use `npm` or `yarn`.

## Framework positioning: stateless, clawdbot-alike (not manus-alike)

**Manus-alike**: self-contained env, single user; storage/data for context is valid because the environment is stable and owned by one actor.

**Clawdbot-alike**: open environment; users can log in and change the environment at any time. If the framework kept storage or data for context, it could become altered or mismatched when someone else changes things. So:

- **OpenViber framework is stateless.** Do not use storage or data to maintain context (conversation, task state, artifacts). Context can be altered and mismatched in an open environment; only the Viber Board should hold it.
- **Conversation history lives only at the Viber Board.** The daemon receives full messages on each request and returns the response; it does not persist or load chat. Viber Board persists and sends history so the LLM has context.
- **Daemon path** (`viber start`, controller): thin runtime only. No Space, no DataAdapter, no Storage for context. `src/daemon/runtime.ts` loads a single agent config from file (static config, not context) and runs `Agent.streamText`. No local state for conversations or tasks.
- **Static config** (e.g. which agent YAML, model, skills) can be local per machine; that is not “context” and is not altered by other users. Do not add storage or data for _context_ (conversation, task state, artifacts) in the framework.
- **Engine concepts** (Space, Plan, artifacts, ViberDataManager, SpaceStorage) remain in the package for optional/legacy use but are **not** used on the daemon path and must not be used to maintain context in an open-environment setup. Keep the daemon path minimal and stateless.

## Per-machine state: ~/.openviber/

Each work machine runs a single viber daemon. **~/.openviber/** is the standard location for that viber's config and optional local artifacts (not conversation context).

- **Config**: `~/.openviber/agents/{id}.yaml` for agent configs; daemon already uses this via `getViberPath()` (see `src/config.ts`, default `storageRoot`).
- **Artifacts (optional)**: The daemon may write task artifacts under `~/.openviber/artifacts/` (e.g. per task or per run). The Viber Board receives only the **final result** (text, summary, optional artifact refs such as paths or IDs); it does not receive the full intermediate stream by default. Storing artifacts on the viber (work machine) keeps large outputs off the wire and lets the Viber Board show refs/links instead of full content.

## Multi-agent and planning

- **Multi-agent** is not used on the daemon path. A single assistant (one agent + skills) is enough for clawdbot-alike. Treat multi-agent (orchestrator, multiple agents, CollaborativePlanner, ParallelExecutionEngine) as optional/legacy; do not add new multi-agent features to the stateless daemon path.

- **Planning** for complex tasks is still needed, and the plan should be **adjustable during execution**. Because the framework is stateless, the plan cannot live in the daemon—it must live at the **Viber Board level** (or in context the Viber Board sends).

- **task.md (or similar)** can be enough for that workflow: the Viber Board maintains a task.md (or equivalent) per thread/task and sends it as part of context (e.g. in the system message or as a prior message). The assistant suggests plan steps or updates; the Viber Board (or a small convention) updates task.md and re-sends on the next request. So: planning + adjustment = conversation + a structured document in context; no Plan class or in-framework state required for the stateless path. If we add a convention later (e.g. task.md format, or a structured block in messages), keep it Viber Board-owned and framework-agnostic.

## Plan and Artifacts (architecture)

- **Context-in, context-out**: Plan and artifacts are optional request context; daemon injects into the agent and returns one final result (text, summary, optional artifact refs). Viber Board (or ~/.openviber/ for blobs) owns persistence; no framework-owned state on the daemon.
- **Full architecture**: `web/src/routes/docs/design/plan-and-artifacts/+page.md` — principles, data flow, storage tiers (~/.openviber/), protocol, conventions. No implementation in the framework until we implement the contract.
