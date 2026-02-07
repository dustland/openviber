---
title: "Context Management"
description: "Context window, compaction, and session hygiene for stateless vibers"
---

# Context Management

OpenViber vibers are **stateless** between requests — no in-process memory carries across calls. The Board (or caller) owns session history and decides what to include in each request. The strategies below keep context useful and within model limits.

---

## 1. What Counts as Context

Context is everything sent to the model for a single run:

| Layer | Examples | Typical Size |
|-------|----------|--------------|
| **System prompt** | Rules, tool definitions, skill instructions, runtime info | 2-6K tokens |
| **Personalization** | `soul.md`, `user.md`, `memory.md` (see [personalization.md](./personalization.md)) | 1-3K tokens |
| **Conversation history** | Prior user/assistant turns, compacted summaries | Variable |
| **Tool calls & results** | Function calls, returned data, attachments | Often the largest contributor |
| **Workspace files** | Code, docs, configs selected for the task | Variable |

**Memory is separate from context.** Memory lives on disk or in Board-managed stores (see [memory.md](./memory.md)), but only becomes context when explicitly injected into a request.

---

## 2. Context Budget

Each model has a fixed context window. The Board should maintain a budget breakdown:

```
┌─────────────────────────────────────────────────┐
│ Model context window (e.g., 128K tokens)        │
├─────────────────────────────────────────────────┤
│ System prompt + tools + skills     │  ~4K       │
│ Personalization (soul/user/memory) │  ~2K       │
│ Reserved for response              │  ~4K       │
│ ─────────────────────────────────────────────── │
│ Available for history + workspace  │  ~118K     │
└─────────────────────────────────────────────────┘
```

### Board Diagnostics

The Board should expose simple diagnostics so operators know when compaction is needed:

- **Context breakdown**: tokens used by each layer (system, tools, skills, history, files).
- **Per-file limits**: indication when a workspace file was truncated.
- **Session gauge**: current token usage vs. model limit.
- **Compaction hint**: visual indicator when history exceeds 70% of available budget.

---

## 3. Compaction (Summarize Older History)

When the context window gets tight, the Board compacts older history into a summary and replaces the original turns.

### Strategy

1. **Keep recent turns intact** — the last N turns (typically 4-8) stay verbatim for continuity.
2. **Summarize older turns** — replace everything before the keep-window with a structured summary.
3. **Persist the summary** — store it in Board-managed session history so future requests include it.

### Summary Format

```markdown
## Session Summary (compacted)
- User asked to build a landing page with dark theme.
- Created `index.html` with Tailwind CSS setup.
- Added hero section and responsive navigation.
- User approved the design; requested footer changes.
- Footer updated with three-column layout.
```

### Trigger Modes

| Mode | Behavior |
|------|----------|
| **Automatic** | Board compacts when history exceeds the compaction threshold (e.g., 70% of available budget) |
| **Manual** | Operator explicitly requests compaction via Board UI or `/compact` command |
| **Pre-flush** | Memory flush happens first (see Section 5), then compaction runs |

---

## 4. Pruning (Tool-Result Hygiene)

Tool outputs are often the largest token contributor. The Board should aggressively manage them:

- **Truncate oversized outputs** — cap tool results at a configurable max (e.g., 8K tokens). Include a `[truncated, {N} tokens omitted]` marker.
- **Drop stale tool results** — historical tool outputs beyond the keep-window can be replaced with a one-line summary: `[tool: read_file("src/app.ts") → 247 lines, TypeScript]`.
- **Preserve verification evidence** — keep tool results that serve as proof of task completion (screenshots, test output, build logs).

### Example: Before and After Pruning

**Before** (12K tokens of tool results):
```
tool_result: read_file("src/components/App.tsx") → [full 500-line file contents]
tool_result: search_web("react hooks best practices") → [full search results]
tool_result: write_file("src/hooks/useAuth.ts") → [file written successfully]
```

**After** (200 tokens):
```
[tool: read_file("src/components/App.tsx") → 500 lines, React component]
[tool: search_web("react hooks best practices") → 8 results summarized]
tool_result: write_file("src/hooks/useAuth.ts") → [file written successfully]
```

---

## 5. Memory Flushes

Before compaction discards older history, a **memory flush** can capture durable insights into the memory system (see [memory.md](./memory.md)).

The flush extracts:

- **Decisions made** — "User chose Tailwind over styled-components."
- **Preferences discovered** — "User prefers concise responses, no emojis."
- **Key artifacts** — "Landing page lives at `src/routes/+page.svelte`."
- **Patterns observed** — "This repo uses conventional commits."

These notes are written to `memory.md` or the daily memory log and may be re-injected in future sessions without keeping the entire history.

---

## 6. Session Reset

If a session becomes too noisy or context-polluted:

1. **Start a new session ID** — clean slate in the Board.
2. **Transfer summary** — carry a short summary of the prior session's outcome.
3. **Re-inject memory** — load relevant memory entries from `memory.md`.
4. **Discard stale tool results** — only bring forward conclusions, not raw outputs.

This keeps the node stateless while preserving continuity in the Board.

---

## 7. Handling Context Overflow

When context exceeds the model's window despite compaction, the Board should follow the recovery path defined in [error-handling.md](./error-handling.md):

1. **Emergency compaction** — aggressively summarize all but the last 2 turns.
2. **Tool result purge** — replace all historical tool results with one-line summaries.
3. **File content drop** — remove injected workspace files (they can be re-read by tools).
4. **Session reset** — as a last resort, start a fresh session with a transfer summary.

The node reports context overflow via `task:error` with error type `context_overflow`, giving the Board a chance to compact and retry.
