# Plan and Artifacts: Architecture

**Thesis:** OpenViber now treats plan and artifacts as **workspace-first**: the work machine holds the durable context under `~/.openviber/` (plans, artifacts, memory), and the OpenViber Board acts as a thin web front-end that reads/writes that workspace. Context is still injected per request; the daemon remains process-stateless (no DB), but the _filesystem_ is the source of truth so channel switches don’t lose context. Each work machine is still a “viber”; OpenViber is the project/brand around them.

---

## Prior art (summary)

| System          | Plan / workflow                                            | Artifacts                                               | Ownership       |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------- | --------------- |
| **Cursor**      | Single Markdown plan, editable before run                  | Plan saved as file                                      | User/IDE        |
| **Antigravity** | task.md (live to-do), implementation_plan.md (pre-approve) | task.md, implementation_plan.md, walkthrough.md + media | Client (brain/) |

Both keep plan and artifacts on the client; the agent consumes them as context and suggests updates; the client persists and re-presents. OpenViber formalizes this at the protocol level with two tiers: **OpenViber Board** (conversation + plan + artifact metadata) and **~/.openviber/** on the work machine (config + optional artifact blobs).

---

## Principles

1. **Process-stateless daemon, filesystem state**  
   The daemon keeps no in-memory conversation/task state between requests, but it **does** read/write the workspace on disk (`~/.openviber/`). This mirrors OpenClaw’s `~/.openclaw` pattern and allows context to persist across channels and restarts without depending on the Board.

2. **Context-in, context-out**  
   Plan and artifacts are opaque context: the daemon injects them into the agent’s context and returns the assistant message; any “update” is carried in that message. The Viber Board (or local storage) persists and re-sends on the next request.

3. **Two tiers of ownership (workspace-first)**

   - **Work machine (`~/.openviber/`)**: canonical workspace. Holds plans (`workspace/task.md`), memory (`workspace/MEMORY.md`, `workspace/memory/YYYY-MM-DD.md`), artifacts (`artifacts/{taskId}/`), skills cache, and per-agent session logs (`agents/{id}/sessions/*.jsonl`). Daemon reads/writes here.
   - **Viber Board**: renders and edits workspace files via WebSocket/API. It can cache conversation for UI speed, but the source of truth lives on disk.

4. **Convention over framework state**  
   The framework defines a small contract (payload shapes, optional markdown conventions). It does not mandate storage schema or UI; Viber Boards can use task.md, implementation_plan.md, or structured JSON.

---

## Architecture

### Data flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  VIBER BOARD                                                             │
│  • conversation (messages)                                               │
│  • plan (markdown or { goal, steps })                                    │
│  • artifacts (list of { id, title, type, ref? })                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  task:submit { goal, messages, plan?, artifacts? }
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  HUB (optional)                                                          │
│  Forwards to daemon; may store task id → status/result                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DAEMON (Viber)                                                          │
│  • Loads config from ~/.openviber/agents/{id}.yaml                           │
│  • Injects plan + artifacts into agent context                           │
│  • Runs Agent.streamText; consumes stream locally                        │
│  • May write artifact blobs to ~/.openviber/artifacts/{taskId}/              │
│  • Returns once: task:completed { text, summary, artifactRefs? }         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  task:completed (no intermediate stream by default)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  VIBER BOARD                                                             │
│  • Persists assistant message; optional plan/artifact updates from text  │
│  • Stores artifact refs; fetches content on demand if ref points to     │
│    Viber Board-owned storage, or displays link if ref is ~/.openviber/ path  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Storage tiers

| Location        | Contents                                                           | Who writes            | Who reads                                 |
| --------------- | ------------------------------------------------------------------ | --------------------- | ----------------------------------------- |
| **~/.openviber/**   | `agents/{id}.yaml` (config), `agents/{id}/sessions/*.jsonl`        | User / daemon         | Daemon, tooling                           |
| **~/.openviber/workspace/** | `task.md` (or other plan), `MEMORY.md`, `memory/YYYY-MM-DD.md`, artifacts checked into workspace if desired | Daemon, user, Board UI | Daemon, Board UI                          |
| **~/.openviber/artifacts/{taskId}/`** | Large blobs produced during tasks (screens, logs) | Daemon                | Daemon (writes), Board via refs           |
| **~/.openviber/skills/** | Skill bundles (ClawHub-compatible) cached locally | User / tooling | Daemon, tooling |
| **Viber Board cache** | Optional message cache for UI performance                    | Board                 | Board                                     |

Conversation/task continuity is guaranteed by the filesystem workspace; the daemon process can restart freely.

### Protocol

**Request (Viber Board → daemon)**

- Required: `goal`, `messages` (UI may load from `workspace/session-log` to prefill).
- Optional: `plan` (from `workspace/task.md` or structured JSON), `artifacts` (metadata list), `memory` excerpts (pulled from `MEMORY.md` / daily logs).

**Response (daemon → Viber Board)**

- Default: one `task:completed` with `result: { text, summary, artifactRefs? }`.
- Optional text-delta stream if UI requests.
- Plan/memory/artifact edits should be surfaced in the assistant message **and** (when large) as `artifactRefs` pointing to files the daemon wrote under `~/.openviber/`.

**Refs**

- `artifactRefs`: e.g. `[{ id, title, type, ref }]` where `ref` is a path under `~/.openviber/artifacts/` or a Viber Board-owned URL/ID. Viber Board shows links or fetches on demand; it does not receive blob content in the result.

---

## Conventions

### Plan

- **As markdown**: Viber Board sends a single string (e.g. contents of `task.md` or `implementation_plan.md`). Agent suggests edits in the reply; Viber Board diffs or replaces and re-sends.
- **As structured**: `{ goal: string, steps: [{ id, title, status }] }` so the Viber Board can render UI and apply diffs without parsing markdown.

### Artifacts

- **In request**: `[{ id, title?, type?, ref? }]`. `ref` is optional (path or URL).
- **In result**: `artifactRefs` (same shape) for new artifacts produced this run. Daemon may write blobs to `~/.openviber/artifacts/{taskId}/{id}.{ext}` and set `ref` to that path; Viber Board stores the ref and does not fetch content unless the user opens it.
- **New artifacts in reply**: agent may emit a structured block (e.g. fenced JSON `artifact_deltas`) or plain text; Viber Board parses and creates new entries, then re-sends the updated list next time.

### ~/.openviber/ layout (canonical)

```
~/.openviber/
├── openai.yaml / config.json        # global config (models, tokens, channels)
├── agents/
│   ├── {id}.yaml                    # agent config
│   └── {id}/sessions/{session}.jsonl# per-session transcripts (jsonl)
├── workspace/                       # primary, human-visible context
│   ├── task.md                      # current plan (or alt structure)
│   ├── MEMORY.md                    # curated long-term notes
│   ├── memory/YYYY-MM-DD.md         # rolling daily logs
│   ├── AGENTS.md / SOUL.md / TOOLS.md / USER.md / IDENTITY.md  # bootstrap files
│   └── artifacts/                   # optional in-workspace artifacts
├── artifacts/{taskId}/              # large blobs created by daemon
├── memory/{agentId}.sqlite          # semantic index of memory/*.md (optional)
└── skills/                          # downloaded/installed skills cache (ClawHub-compatible bundles)
```

---

## What the framework provides

- **Contract**: Task payload accepts optional `plan` and `artifacts`; daemon injects them into agent context; result may include `artifactRefs`.
- **Convention**: Document the shapes above (plan as string or `{ goal, steps }`; artifacts as list of `{ id, title?, type?, ref? }`) so Viber Boards and prompts interoperate.
- **No framework-owned storage** on the daemon path: no Plan/Artifact classes or DB; only config and optional files under ~/.openviber/.

## Viber Board responsibility

- Persist messages, plan, and artifact metadata; send them with every request.
- Parse assistant message for plan/artifact updates (or structured blocks) and apply them.
- Store artifact refs; resolve refs to content on demand (or show links for ~/.openviber/ paths).
- Do not assume intermediate stream events; rely on a single final result.

---

## Summary

| Concept       | Ownership                                            | Flow                                                              | Storage / format                       |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| **Plan**      | Viber Board                                          | In: `plan` in request. Out: updates in assistant message.         | Markdown or `{ goal, steps }`.         |
| **Artifacts** | Viber Board (metadata); optionally ~/.openviber/ (blobs) | In: `artifacts` list. Out: `artifactRefs` + new items in message. | List of `{ id, title?, type?, ref? }`. |
| **Config**    | ~/.openviber/                                            | Daemon reads at startup / per task.                               | `agents/{id}.yaml`.                    |
| **Result**    | Daemon → Viber Board                                 | Single `task:completed` with `text`, `summary`, `artifactRefs?`.  | No intermediate stream by default.     |

This yields a single, consistent architecture: **context-in, context-out**, two storage tiers (Viber Board + ~/.openviber/), and a minimal protocol that stays stateless on the daemon while supporting plan and artifacts in an elegant way.
