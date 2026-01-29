---
title: "Viber vs Clawdbot"
description: How Viber's local-first architecture compares to Clawdbot's centralized approach
---
import { Aside } from "$lib/components/docs";

## Architectural Philosophy

Viber and Clawdbot take fundamentally different approaches to agent deployment. Understanding these differences helps you choose the right tool for your use case.

<Aside type="tip">
  Viber adopts Clawdbot's excellent **Skill** format but uses a **Local-First Desktop Daemon** architecture instead of a centralized server.
</Aside>

---

## The Key Difference: Topology

| Aspect | Clawdbot | Viber |
|--------|----------|-------|
| **Deployment** | Centralized Server | Distributed Desktop Daemons |
| **Connection** | Clients connect IN to gateway | Daemons connect OUT to command centers |
| **Network** | Requires public IP/domain | No public IP needed |
| **Workflows** | Rigid JSON/YAML pipelines | Fluid AI-driven Playbooks |
| **Channels** | Gateway-hosted (WhatsApp, Telegram) | Built-in (DingTalk, WeCom, Web) |
| **Failure Mode** | Single point of failure | Each daemon independent |

---

## Centralized Server vs Desktop Daemon

### Clawdbot: Centralized Gateway

Clawdbot runs as a **central server** that clients connect to:

```
          ┌─────────────────────────────────────────┐
          │          CLAWDBOT SERVER                │
          │       (Public IP / Domain)              │
          │   • Routes messages to agents           │
          │   • Manages session state               │
          │   • Hosts all channel connections       │
          └─────────────────────────────────────────┘
                   ▲           ▲           ▲
              WhatsApp     Telegram      API
              (inbound)    (inbound)   (inbound)
```

**Trade-offs:**
- ✓ Centralized control and monitoring
- ✓ Single deployment
- ✗ Requires public IP / domain
- ✗ Single point of failure
- ✗ No access to user desktop

### Viber: Desktop Daemon

Viber runs as a **local daemon** on user machines, connecting **outbound** to command centers:

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  MacBook Daemon │  │  Docker Daemon  │  │  Cloud VM Daemon│
│  Desktop + File │  │  File + Web     │  │  Full access    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │ outbound           │ outbound           │ outbound
         ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────┐
    │              COMMAND CENTER (Web UI)                │
    │       viber-macbook ● Connected                     │
    │       viber-docker  ● Connected                     │
    └─────────────────────────────────────────────────────┘
```

**Advantages:**
- ✓ No public IP needed (outbound connections)
- ✓ Full access to user desktop (UI automation, local files)
- ✓ Each daemon runs independently
- ✓ Built-in chat channels (DingTalk, WeCom, Web)
- ✓ Connect multiple daemons to one command center

---

## Workflow Comparison

### Clawdbot's Lobster: Typed Workflows

Clawdbot uses **Lobster**, a typed workflow runtime with rigid pipelines:

```yaml
# Lobster: Deterministic and linear
pipeline:
  - collect:
      command: "find . -name '*.ts'"
  - process:
      stdin: "$collect.stdout"
      command: "parse-files"
  - output:
      stdin: "$process.stdout"
```

**Characteristics:**
- Explicit `stdin`/`stdout` data passing
- Deterministic execution order
- JSON/YAML configuration
- Predictable but inflexible

### Viber's Playbooks: Agentic Procedures

Viber uses **Playbooks**—Markdown-defined workflows interpreted by a Supervisor Agent:

```markdown
# Playbook: release-feature

## Goal
Prepare a feature branch for release.

## Steps
1. [Coder] Run all tests and ensure they pass.
2. [Coder] Bump the version in package.json.
3. [Git] Create a new branch named `release/v<version>`.
4. [Git] Push the branch and open a PR.
```

**Advantages:**
- Natural language instructions
- Dynamic planning and adaptation
- Agent selection based on capability
- Human-readable format

<Aside type="note">
  Playbooks are **guidelines**, not rigid scripts. The Supervisor Agent interprets them intelligently, adapting to unexpected situations.
</Aside>

---

## Skill System: Shared Pattern

Both frameworks use the `SKILL.md` format—a pattern Viber directly adopts from Clawdbot:

```markdown
---
name: git-commit
description: Stage changes and commit with a message.
parameters:
  message:
    type: string
    description: The commit message
    required: true
---
git add .
git commit -m "$message"
```

**Why this works:**
- Decoupled from core runtime code
- Self-documenting capabilities
- Easy to extend and share
- LLM-friendly metadata

---

## When to Choose What

### Choose Viber

**Viber is ideal when:**

- Need desktop access (file system, UI automation)
- No public IP available (outbound-only connections)
- Building products with embedded AI workers
- Prefer TypeScript-first development
- Want AI-driven workflow adaptation
- Need DingTalk/WeCom/Web chat integration

### Choose Clawdbot

**Clawdbot is ideal when:**

- Have a central server with public IP
- Building WhatsApp/Telegram bots
- Want deterministic, predictable pipelines
- Prefer rigid workflow definitions
- Need centralized monitoring dashboard

---

## Summary

| You need... | Clawdbot | Viber |
|-------------|----------|-------|
| Centralized server | ✓ | — |
| Desktop daemon | — | ✓ |
| Public IP required | ✓ | — |
| Outbound-only | — | ✓ |
| Deterministic workflows | ✓ | — |
| AI-adaptive workflows | — | ✓ |
| WhatsApp/Telegram | ✓ | — |
| DingTalk/WeCom/Web | — | ✓ |
| Skill format | ✓ | ✓ |
| TypeScript-first | — | ✓ |
| Desktop automation | — | ✓ |

<Aside type="tip">
  Viber takes Clawdbot's excellent Skill pattern while using a local-first daemon architecture optimized for desktop workers and outbound connections.
</Aside>
