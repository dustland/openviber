# Contribution Golden Paths

This guide provides task-oriented contributor checklists for extending OpenViber while preserving architecture boundaries and code quality.

## Add a new channel

1. Define config and types in `src/channels/channel.ts`.
2. Implement the channel class in `src/channels/<name>.ts`.
3. Register the factory in `src/channels/builtin.ts`.
4. Ensure bootstrap/env config mapping in `src/channels/config.ts` if needed.
5. Add focused tests near the implementation (unit first, then integration if routing behavior changes).
6. Update docs:
   - `docs/reference/channel-capability-matrix.md`
   - user-facing config docs (if new env vars/options are added)

**Validation checklist**

- `pnpm typecheck`
- `pnpm test:run -- src/channels`
- `pnpm test:run` (if shared channel manager behavior changed)

## Add a new skill

1. Create `src/skills/<skill-id>/index.ts`.
2. Add `src/skills/<skill-id>/SKILL.md` with clear usage boundaries.
3. Register skill metadata in `src/skills/registry.ts` (or the active registry wiring path).
4. Add tests in `src/skills/*.test.ts` or `*.integration.test.ts` as appropriate.
5. Run skills verification scripts and fix any metadata/packaging issues.

**Validation checklist**

- `pnpm typecheck`
- `pnpm test:run -- src/skills`
- `pnpm verify:skills`

## Add a new tool

1. Implement the tool in `src/tools/<tool>.ts`.
2. Export/register through `src/tools/index.ts` and any runtime wiring points.
3. Ensure tool input/output shape is explicit and stable.
4. Add/update tests (`src/tools/<tool>.test.ts`).
5. Update docs in `docs/concepts/tools.md` if tool contract changes.

**Validation checklist**

- `pnpm typecheck`
- `pnpm test:run -- src/tools`
- `pnpm test:run` (if shared base-tool behavior changed)

## Architecture boundary guardrail

Run:

- `pnpm verify:architecture`

This check catches forbidden cross-layer imports that make the codebase harder to reason about.
