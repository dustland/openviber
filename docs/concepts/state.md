---
title: "Context"
description: "How information flows between you and your viber"
---

# Context

**Context** is the information that flows between you and your viber on each interaction. Understanding context helps you work effectively with your AI teammate.

## The Request-Response Flow

Each time you interact with your viber:

1. **You send a request** — Your message plus accumulated context
2. **Viber processes** — Agent reasons with full context
3. **Viber responds** — Answer plus any updates to context
4. **Context is saved** — Ready for the next interaction

## What's Included in Context?

| Element | Description |
|---------|-------------|
| **Messages** | Your conversation history |
| **Plan** | Current goals and tasks |
| **Memory** | Relevant past decisions |
| **Artifacts** | References to files and outputs |

## Local-First Design

A key principle of OpenViber:

- **Viber Board** maintains your conversation and plan
- **Work machine** (`~/.openviber/`) stores durable context
- **Agent** is stateless between requests

This means you can switch chat apps without losing context — it's saved locally on your machine.

## Context Accumulates

Unlike one-shot AI interactions, context builds over time:

**Without accumulation:**
> "Research X" → Result
> "Summarize X" → "What X? I don't remember"

**With accumulation:**
> "Research X" → Result saved to context
> "Summarize X" → Summarizes based on previous research

This is what makes vibers useful for real work that spans multiple conversations.

## Privacy

Because context lives on your machine, your information never leaves unless you explicitly choose to share it. This is fundamental to OpenViber's design.

## Next Steps

- [Memory](/docs/concepts/memory) — Deep dive into memory systems
- [Workspaces](/docs/concepts/spaces) — Organizing project context
