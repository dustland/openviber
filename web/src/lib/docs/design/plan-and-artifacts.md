# Plan and Artifacts: Architecture

**Thesis:** Viber treats plan and artifacts as **context-in, context-out**: the cockpit (or ~/.viber/ on the work machine) owns persistence; the daemon injects context into the agent and returns a single final result; no framework-owned conversation or task state on the daemon.

---

## Prior art (summary)

| System          | Plan / workflow                                            | Artifacts                                               | Ownership       |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------- | --------------- |
| **Cursor**      | Single Markdown plan, editable before run                  | Plan saved as file                                      | User/IDE        |
| **Antigravity** | task.md (live to-do), implementation_plan.md (pre-approve) | task.md, implementation_plan.md, walkthrough.md + media | Client (brain/) |

Both keep plan and artifacts on the client; the agent consumes them as context and suggests updates; the client persists and re-presents. Viber formalizes this at the protocol level with two tiers: **cockpit** (conversation + plan + artifact metadata) and **~/.viber/** on the work machine (config + optional artifact blobs).

---

## Principles

1. **Stateless daemon**  
   The daemon does not store conversation, task state, or artifact content. It receives context (goal, messages, plan, artifacts) and returns one **final result** (text, summary, optional refs). No streaming of intermediate steps by default.

2. **Context-in, context-out**  
   Plan and artifacts are opaque context: the daemon injects them into the agent’s context and returns the assistant message; any “update” is carried in that message. The cockpit (or local storage) persists and re-sends on the next request.

3. **Two tiers of ownership**
   - **Cockpit**: conversation history, plan (e.g. task.md or structured steps), artifact _metadata_ and optional content. Sent with every request.
   - **Work machine (~/.viber/)**: static config (`agents/{id}.yaml`) and optional **artifact storage** (blobs under `artifacts/`). Daemon may write artifacts here and return only refs (paths/IDs) in the result so the cockpit doesn’t carry large payloads.

4. **Convention over framework state**  
   The framework defines a small contract (payload shapes, optional markdown conventions). It does not mandate storage schema or UI; cockpits can use task.md, implementation_plan.md, or structured JSON.

---

## Architecture

### Data flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  COCKPIT                                                                 │
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
│  • Loads config from ~/.viber/agents/{id}.yaml                           │
│  • Injects plan + artifacts into agent context                           │
│  • Runs Agent.streamText; consumes stream locally                        │
│  • May write artifact blobs to ~/.viber/artifacts/{taskId}/              │
│  • Returns once: task:completed { text, summary, artifactRefs? }         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  task:completed (no intermediate stream by default)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  COCKPIT                                                                 │
│  • Persists assistant message; optional plan/artifact updates from text  │
│  • Stores artifact refs; fetches content on demand if ref points to     │
│    cockpit-owned storage, or displays link if ref is ~/.viber/ path      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Storage tiers

| Location      | Contents                          | Who writes   | Who reads                                |
| ------------- | --------------------------------- | ------------ | ---------------------------------------- |
| **Cockpit**   | messages, plan, artifact metadata | Cockpit      | Cockpit, daemon (as context-in)          |
| **~/.viber/** | `agents/{id}.yaml` (config)       | User / setup | Daemon                                   |
| **~/.viber/** | `artifacts/{taskId}/` (blobs)     | Daemon       | Daemon (write refs); cockpit (refs only) |

The daemon is stateless for **conversation and task state**; the only durable state on the work machine is **config** and **optional artifact files**. The cockpit never needs the full intermediate stream—only the final result and refs.

### Protocol

**Request (cockpit → daemon)**

- Required: `goal`, `messages` (full history).
- Optional: `plan`, `artifacts`.

**Response (daemon → cockpit)**

- By default: one `task:completed` with `result: { text, summary, artifactRefs? }`.
- No `task:progress` stream unless explicitly opted in (e.g. text-delta-only for live typing).
- Plan/artifact updates are **in the assistant message** (natural language or a structured block); cockpit parses and applies.

**Refs**

- `artifactRefs`: e.g. `[{ id, title, type, ref }]` where `ref` is a path under `~/.viber/artifacts/` or a cockpit-owned URL/ID. Cockpit shows links or fetches on demand; it does not receive blob content in the result.

---

## Conventions

### Plan

- **As markdown**: cockpit sends a single string (e.g. contents of `task.md` or `implementation_plan.md`). Agent suggests edits in the reply; cockpit diffs or replaces and re-sends.
- **As structured**: `{ goal: string, steps: [{ id, title, status }] }` so the cockpit can render UI and apply diffs without parsing markdown.

### Artifacts

- **In request**: `[{ id, title?, type?, ref? }]`. `ref` is optional (path or URL).
- **In result**: `artifactRefs` (same shape) for new artifacts produced this run. Daemon may write blobs to `~/.viber/artifacts/{taskId}/{id}.{ext}` and set `ref` to that path; cockpit stores the ref and does not fetch content unless the user opens it.
- **New artifacts in reply**: agent may emit a structured block (e.g. fenced JSON `artifact_deltas`) or plain text; cockpit parses and creates new entries, then re-sends the updated list next time.

### ~/.viber/ layout (canonical)

```
~/.viber/
├── agents/
│   └── {id}.yaml          # Agent config (model, tools, skills, system prompt)
└── artifacts/            # Optional; daemon writes here when producing artifacts
    └── {taskId}/
        └── {id}.{ext}    # e.g. walkthrough.md, screenshot.png
```

---

## What the framework provides

- **Contract**: Task payload accepts optional `plan` and `artifacts`; daemon injects them into agent context; result may include `artifactRefs`.
- **Convention**: Document the shapes above (plan as string or `{ goal, steps }`; artifacts as list of `{ id, title?, type?, ref? }`) so cockpits and prompts interoperate.
- **No framework-owned storage** on the daemon path: no Plan/Artifact classes or DB; only config and optional files under ~/.viber/.

## Cockpit responsibility

- Persist messages, plan, and artifact metadata; send them with every request.
- Parse assistant message for plan/artifact updates (or structured blocks) and apply them.
- Store artifact refs; resolve refs to content on demand (or show links for ~/.viber/ paths).
- Do not assume intermediate stream events; rely on a single final result.

---

## Summary

| Concept       | Ownership                                        | Flow                                                              | Storage / format                       |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------- |
| **Plan**      | Cockpit                                          | In: `plan` in request. Out: updates in assistant message.         | Markdown or `{ goal, steps }`.         |
| **Artifacts** | Cockpit (metadata); optionally ~/.viber/ (blobs) | In: `artifacts` list. Out: `artifactRefs` + new items in message. | List of `{ id, title?, type?, ref? }`. |
| **Config**    | ~/.viber/                                        | Daemon reads at startup / per task.                               | `agents/{id}.yaml`.                    |
| **Result**    | Daemon → cockpit                                 | Single `task:completed` with `text`, `summary`, `artifactRefs?`.  | No intermediate stream by default.     |

This yields a single, consistent architecture: **context-in, context-out**, two storage tiers (cockpit + ~/.viber/), and a minimal protocol that stays stateless on the daemon while supporting plan and artifacts in an elegant way.
