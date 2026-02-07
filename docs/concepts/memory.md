---
title: "Memory"
description: "How your viber remembers context across conversations"
---

# Memory

**Memory** is how your viber maintains context and remembers what has been discussed, decided, and produced. It enables truly resumable work — you can come back after days and pick up where you left off.

## Two Components

OpenViber's memory system has two parts:

### 1. Viber Memory (Human-Readable)

Each viber maintains its own memory:

- **Notes** — Important decisions and context (`memory.md`)
- **Daily logs** — Rolling record of work (`memory/YYYY-MM-DD.md`)

**Location:** `~/.openviber/vibers/{id}/`

You can browse, edit, and version-control these files like any project.

### Working Data (Spaces)

The things vibers produce and work on live in **spaces**:

- **Plans** — Current tasks and goals
- **Artifacts** — Files, documents, code produced

**Location:** `~/openviber_spaces/` (or any directory the viber is pointed at)

### 2. Semantic Memory (AI-Optimized)

The semantic memory is how agents quickly find relevant context:

- **Meaning-based retrieval** — Find information by concept, not just keywords
- **Summarized knowledge** — Key decisions without overwhelming detail
- **Fast lookups** — Optimized for efficient reasoning

When an agent needs to remember "What did we decide about the database schema?", it queries semantic memory to get a focused, relevant response.

## How They Work Together

1. You ask the agent to continue work on a feature
2. The agent queries **semantic memory** for relevant context
3. Semantic memory points to specific files in the **space**
4. The agent reads those files for full detail
5. Work continues with full context

## Why This Matters

Without memory:
> "Write chapter 3 of the documentation"
> Agent: "What documentation? What's in chapters 1-2?"

With memory:
> "Write chapter 3 of the documentation"
> Agent: "Based on chapters 1-2 about architecture and setup, chapter 3 should cover..."

## Local by Default

All memory lives on your machine at `~/.openviber/vibers/{id}/`. This means:

- **Privacy** — Your context never leaves your machine
- **Persistence** — Switching chat apps doesn't lose context
- **Transparency** — You can see exactly what the viber remembers
- **Isolation** — Each viber has independent memory

## Next Steps

- [Viber](/docs/concepts/viber) — Core viber concepts and working modes
