---
title: "Context Management"
description: "Context window, compaction, and session hygiene for stateless vibers"
---

# Context Management

OpenViber vibers are **stateless** between requests, so the OpenViber Board (or caller) must own session history and decide what to send. The practices below keep context useful and within model limits.

## 1. What counts as context

Context is everything sent to the model for a run:

- system prompt (rules, tools, skill list, runtime info),
- conversation history,
- tool calls/results and attachments,
- selected workspace files.

**Memory** is separate: it can live on disk or in Board-managed stores, but it only becomes context when it is injected.

## 2. Context inspection (Board-facing)

The Board should expose simple diagnostics:

- **Context breakdown**: how many tokens are used by system prompt, tools, skills, and injected files.
- **Per-file limits**: indicate truncation when a workspace file is too large.
- **Session size**: current message count / token usage.

This makes it obvious when compaction is needed.

## 3. Compaction (summarize older history)

When the context window gets tight, the Board should compact older history into a summary entry and re-send that summary on subsequent requests.

Recommended behavior:

1. Keep the most recent turns intact.
2. Replace older history with a compacted summary.
3. Persist the summary in Board-managed session history.

Compaction can be **automatic** (when nearing limits) or **manual** (explicit user request).

## 4. Pruning (tool-result hygiene)

Tool outputs are often the largest token contributor. The Board should:

- truncate oversized tool outputs,
- drop non-essential historical tool outputs when needed,
- preserve only the minimal evidence required for verification.

## 5. Memory flushes (optional)

Before compaction, a “memory flush” step can capture durable notes (decisions, preferences, key artifacts) into the Board’s memory store. These notes may be re-injected later without keeping the entire history in context.

## 6. Session reset

If a session becomes too noisy:

- start a new session id,
- keep a short transfer summary,
- carry forward only essential memory entries.

This keeps the daemon stateless while still preserving continuity in the Board.
