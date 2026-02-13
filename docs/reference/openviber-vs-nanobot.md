# OpenViber vs NanoBot: Project Structure & Architecture Comparison

Date: 2026-02-12

## Method

I compared:

- OpenViber repository structure and architecture docs in this repo.
- NanoBot (`HKUDS/nanobot`) at `main` (cloned locally to `/tmp/nanobot`).

Commands used:

- `rg --files | head -n 200` (OpenViber)
- `cat package.json` (OpenViber)
- `git clone --depth 1 https://github.com/HKUDS/nanobot /tmp/nanobot`
- `cd /tmp/nanobot && rg --files | head -n 200`
- `cd /tmp/nanobot && sed -n '1,240p' README.md`
- `cd /tmp/nanobot && sed -n '1,220p' COMMUNICATION.md`

## High-level verdict

OpenViber is **more architecturally explicit and maintainable** than NanoBot in several key ways:

1. **Architecture as first-class docs**: OpenViber has a dedicated `docs/design/` set with specific specs (protocol, task lifecycle, context, memory, streaming, security, error handling, etc.), which creates stronger design coherence and onboarding clarity.
2. **Runtime boundary clarity**: OpenViber separates `cli`, `daemon`, `channels`, `skills`, `tools`, `viber`, and `web` clearly.
3. **Typed consistency in core runtime**: OpenViber is TypeScript-first end-to-end (core + web), reducing language/context switching overhead.
4. **Validation and test posture**: OpenViber includes broad test coverage across modules and explicit verification scripts (`test:run`, `typecheck`, `verify:skills`).

NanoBot is still strong in pragmatic breadth (many channels, Python + TS bridge, practical workspace conventions), but its architecture is less explicitly codified and less consistently layered in documentation.

## Side-by-side comparison

| Dimension | OpenViber | NanoBot | Assessment |
|---|---|---|---|
| Architectural docs | Rich design docs set under `docs/design/` with multiple focused specs | Fewer architecture docs (`README.md`, `COMMUNICATION.md`) | **OpenViber leads** in architectural explicitness |
| Layering | Distinct top-level runtime concerns (`src/daemon`, `src/channels`, `src/tools`, `src/skills`, `src/viber`, `web`) | Python core + separate TS bridge; good modularity but less documented boundary contracts | **OpenViber leads** in visible layering discipline |
| Language consistency | TS across core + web | Python core + TypeScript bridge | Depends on team, but **OpenViber is more uniform** |
| Test/verification ergonomics | Vitest, typecheck, dedicated skills verification scripts | Python project structure with fewer obvious project-wide validation commands in top-level docs | **OpenViber leads** in explicit quality gates |
| Multi-channel capability | Multiple channels plus web app | Very broad channel support in Python | **Comparable**, NanoBot has strong breadth |
| Personalization/memory model | Explicit three-file personalization pattern and runtime conventions | Workspace files and memory docs present, but less formalized lifecycle docs | **OpenViber leads** in formalization |

## Where OpenViber can still improve

OpenViber is cleaner overall, but there are areas where NanoBot-style pragmatism suggests useful improvements:

1. **Single architecture overview artifact**
   - Add one concise visual architecture diagram (like NanoBot's architecture image) that links to detailed docs.
   - Why: improves first-time comprehension before deep reading.

2. **Channel capability matrix in docs**
   - Create a table listing channel status, auth mode, media support, and reliability expectations.
   - Why: operational clarity for adopters.

3. **Cross-language integration story (if future polyglot)**
   - If OpenViber adds polyglot workers/tools, define strict interface contracts early (events, tool schema, retries).
   - Why: preserve current elegance while scaling capability breadth.

4. **Architecture fitness checks**
   - Add lightweight CI checks for forbidden imports across layers (e.g., `web` cannot import daemon internals).
   - Why: enforce boundaries mechanically, not just culturally.

5. **Developer “golden path” docs**
   - Add one task-focused guide: “add a channel”, “add a skill”, “add a tool” with test checklist templates.
   - Why: lower contributor variance, keep coding style consistent as team grows.

## Conclusion

If the bar is architectural elegance + coding taste (clarity of layers, explicit contracts, and maintainability signals), **OpenViber is ahead**.

If the bar is immediate channel breadth and pragmatic integration footprint, NanoBot is competitive and occasionally stronger.

The best next move is not a rewrite: keep OpenViber’s current architecture, then add the five improvements above to compound its lead.


## Progress on suggested improvements

Implemented in this repository:

1. ✅ Added a concise architecture overview document with a visual topology map: `docs/design/architecture-overview.md`.
2. ✅ Added a channel capability matrix: `docs/reference/channel-capability-matrix.md`.
3. ✅ Added contributor golden-path docs for adding channels/skills/tools: `docs/guides/contribution-golden-path.md`.
4. ✅ Added architecture fitness checks via `scripts/verify-architecture.ts` and `pnpm verify:architecture`.

Still recommended for future evolution:

5. ✅ Added a cross-language integration contract document: `docs/design/polyglot-integration-contract.md`.
