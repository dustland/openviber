# Viber Self-Containment Review (Post-Renaming)

## Review Goal

Re-evaluate whether the local **Viber runtime** is a good self-contained engine that can execute **tasks** without hard dependency on:

1. a Gateway control plane, and
2. Supabase-backed data.

This revision reflects the latest terminology direction:

- **"Viber Node" → "Viber"**
- **"Viber (work item/session)" → "Task"**

## What changed since the previous review

Compared to the earlier review, there is meaningful progress around standalone onboarding and task-centric language in parts of the stack:

- Onboarding now supports an explicit **standalone mode** (`npx openviber onboard` without token).
- Standalone onboarding scaffolds local config and personalization files under `~/.openviber`.
- The CLI and runtime internals increasingly use task-oriented naming even where external compatibility still uses `viber` terminology.

That said, daemon runtime boot (`npx openviber start`) still initializes the controller path that expects a gateway WebSocket endpoint (remote or local default).

## Executive Summary

**Verdict: stronger than before, but still “runtime-core self-contained + orchestration partially gateway-coupled.”**

- Core task execution is local-first and does not require Supabase.
- Supabase remains optional and mode-driven.
- Standalone onboarding is now first-class.
- But long-running daemon orchestration still relies on controller WebSocket semantics; in standalone setups this falls back to local gateway assumptions.

## Detailed Findings

### 1) Core task engine is self-contained and local-first

- `runTask` executes from local agent config, local personalization files, and local skill/tool loading.
- Personalization uses `soul.md`, `user.md`, `memory.md`, plus recent local daily logs.

**Assessment:** ✅ Good self-contained execution core.

### 2) Standalone setup has improved materially

- `npx openviber onboard` now supports standalone setup when no token is passed.
- Standalone mode writes `~/.openviber/config.yaml` with `mode: "standalone"` and scaffolds local viber config + personalization files.

**Assessment:** ✅ Significant operational UX improvement for local-only users.

### 3) Daemon start path is still gateway-controller oriented

- `npx openviber start` still builds `ViberController` and uses server URL resolution logic that defaults to local gateway WebSocket (`ws://localhost:6009/ws`) when no connected config is present.
- Therefore, the daemon control loop remains oriented around inbound gateway messages for task submit/stop/message orchestration.

**Assessment:** ⚠️ Core engine can run alone, but daemon orchestration is not yet fully gateway-independent.

### 4) Terminology migration (viber → task) is underway, not complete

- Runtime internals are already task-shaped in key places (`taskId`, task lifecycle/event concepts).
- But many compatibility surfaces still retain `viber:*` message types, `/api/vibers/*` routes, and viber-specific naming.

**Assessment:** ⚠️ Direction is correct; migration is active but incomplete.

### 5) Supabase dependency remains optional

- Data adapter factory still defaults to local mode when Supabase is not configured.
- Database/supabase behavior is opt-in via mode/environment.
- Local settings persistence is file-based (`~/.openviber/settings.yaml`) and remains usable without Supabase.

**Assessment:** ✅ No hard Supabase dependency for local task execution.

## Dependency Matrix (Current)

| Capability | Gateway required? | Supabase required? | Notes |
|---|---:|---:|---|
| Local single task (`npx openviber run`) | No | No | Fully local task runtime |
| Standalone onboarding | No | No | Local config scaffolding + personalization bootstrap |
| Daemon runtime (`npx openviber start`) | Practically yes today (remote or local gateway WS) | No | Controller-first orchestration path |
| Task status via gateway APIs | Yes | No (local gateway mode) | Today primarily exposed via `/api/vibers/*` compatibility routes |
| Supabase-backed web persistence | No (for local runtime) | Yes | Optional web/data mode |

## Gaps to “fully self-contained Viber engine”

1. `npx openviber start` has not yet fully split into a true local orchestration loop independent of gateway WS semantics.
2. Task ingress/control in daemon mode is still predominantly gateway-message-driven.
3. Naming migration still spans both task-first and legacy viber vocabulary, which can obscure architecture boundaries.

## Recommendations (Updated)

1. Introduce a strict **standalone runtime mode** in `npx openviber start` that does not attempt gateway connection by default.
2. Provide first-class local task ingress in standalone mode (local HTTP/WS/IPC) for submit/stop/message.
3. Continue API/event contract migration to task-first naming while maintaining explicit compatibility layers.
4. Document runtime profiles clearly:
   - **Standalone Viber Runtime** (no gateway, no Supabase)
   - **Connected Viber Runtime** (gateway-managed, optional Supabase-backed web data)

## Final Assessment

OpenViber is now closer to the target than in the previous review: standalone onboarding and task-oriented surfaces are clear progress. The remaining architectural step is to make daemon orchestration fully independent from gateway WebSocket control when running in standalone mode.
