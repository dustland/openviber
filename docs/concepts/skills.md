---
title: "Skills"
description: "Domain knowledge that teaches agents how to approach specific tasks"
---

# Skills

**Skills** are bundles of domain knowledge that teach agents how to approach specific tasks. Unlike tools (which provide actions), skills provide *knowledge* and *context*.

## The Difference

| | Skills | Tools |
|---|--------|-------|
| **Purpose** | Teach *how to think* | Provide *what to do* |
| **Content** | Instructions, best practices | Executable actions |
| **Example** | "How to debug React apps" | `file.write()` |

## How Skills Work

When you assign a skill to an agent, it learns:

- **What to look for** — Patterns, signals, indicators
- **How to approach problems** — Strategies, best practices
- **When to escalate** — Edge cases, risky situations
- **Domain vocabulary** — Specific terms and concepts

For example, an "antigravity" skill might teach an agent:
- How to detect IDE agent errors
- Where to look for crash indicators
- Steps to recover from failures
- When to alert the user

## Using Skills

Skills are assigned to agents when you configure them. An agent with the right skills can handle domain-specific tasks without detailed instructions each time.

**Without skill:**
> "Check the Antigravity IDE for agent terminated errors. If you find one, look for the retry button and click it. Then wait and verify..."

**With skill:**
> "Monitor Antigravity and auto-recover if needed."

The skill contains all the detailed knowledge.

## Skill Bundles

A skill can include:

- **Instructions** — What the agent should know
- **Specialized tools** — Actions specific to this domain
- **Examples** — Reference cases for the agent

This "atomic" approach keeps detection and recovery bundled together.

## Built-in Skills

| Skill | Purpose |
|-------|---------|
| **antigravity** | Monitor and heal Antigravity IDE agent errors |
| **cursor-agent** | Run Cursor CLI agent workflows through tmux-backed automation |
| **codex-cli** | Run OpenAI Codex CLI workflows via non-interactive `codex exec` |
| **tmux** | Execute TTY-dependent commands and manage persistent terminal sessions |

## Creating Custom Skills

Skills are defined as simple markdown files with a YAML header describing metadata. The body contains the instructions that get injected into the agent's context.

This makes skills easy to write, read, and share.

## Next Steps

- [Tools](/docs/concepts/tools) — Actions that agents can take
- [Viber](/docs/concepts/viber) — How to configure vibers with skills
