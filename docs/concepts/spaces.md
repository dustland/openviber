---
title: "Spaces"  
description: "Isolated environments for organizing agent work"
---

# Spaces

A **space** is an isolated environment where your viber organizes work on a specific project. Each space keeps its own context, artifacts, and history separate from other projects.

## Why Spaces?

When you work on multiple projects, you don't want:
- Research about "Project A" bleeding into "Project B"
- Files from different projects mixing together
- Context from unrelated work confusing the agent

Spaces keep everything organized.

## What's in a Space?

| Content | Purpose |
|---------|---------|
| **Conversation history** | What you've discussed |
| **Artifacts** | Files, documents, code produced |
| **Plan** | Current tasks and goals |
| **Memory** | Key decisions and context |

## Default Space

By default, OpenViber uses a single space at `~/.openviber/space/`. This works well for most users who interact with one viber at a time.

## Multiple Spaces

For advanced use cases (like separate spaces per project), you can configure distinct space paths. Each space maintains its own isolated context.

## Persistence

Spaces persist across sessions. You can:

- Close your computer and come back tomorrow
- Switch chat channels and continue the same work
- Resume exactly where you left off

## Next Steps

- [Memory](/docs/concepts/memory) — How context is stored within a space
- [Agents](/docs/concepts/agents) — Workers that operate within spaces
