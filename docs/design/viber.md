---
title: "Viber Design"
description: "Top-down architecture: what a Viber is, how Vibers work, and how tasks operate"
---

# Viber Design

OpenViber is a workspace-first platform where each **Viber** is an AI worker running on a machine you own.

---

## 1. Core Concepts

| Term | Definition |
|------|-----------|
| **Viber** | A machine running the OpenViber runtime. The Viber is the **AI Worker** that executes tasks. |
| **Task** | A unit of work or assignment with its own persona, goals, tools, budget, and guardrails. |
| **OpenViber Board** | The web cockpit operators use to observe, chat with, and control tasks. |
| **Space** | A working directory (repo, research folder, output directory) that tasks operate in. |

A task combines three elements:

```mermaid
flowchart LR
    subgraph Task["One Task"]
      Agent["ViberAgent"]
      Machine["Machine runtime<br/>(terminal, browser, files, apps)"]
      Identity["Identity + accounts<br/>(GitHub, Google, cloud services)"]
      Budget["Budget policy"]
    end

    Agent --> Machine
    Agent --> Identity
    Agent --> Budget
```

The project is **OpenViber**; the machine (and worker) is a **Viber**; each unit of work is a **Task**.

---

## 2. System Topology

```mermaid
flowchart LR
    subgraph Board["OpenViber Board (web cockpit)"]
      Chat["Chat"]
      Status["Task status"]
      Terms["Terminal panels (tmux)"]
      Reports["Reports / evidence"]
    end
    subgraph Gateway["Gateway (optional relay)"]
      WS["WS route"]
    end
    subgraph Viber["Viber (Machine)"]
      Scheduler["Scheduler + dispatcher"]
      V1["dev-task"]
      V2["researcher-task"]
      V3["pm-task"]
    end
    subgraph Config["~/.openviber/ (config)"]
      Cfg["config.yaml / user.md"]
      VCfg["vibers/ (soul, memory, sessions)"]
      Skills["skills/"]
    end
    subgraph Spaces["~/openviber_spaces/ (working data)"]
      S1["my-webapp/"]
      S2["market-research/"]
    end

    Chat --> WS
    WS --> Scheduler
    Scheduler --> V1
    Scheduler --> V2
    Scheduler --> V3
    V1 --> Config
    V1 --> Spaces
    V2 --> Config
    V2 --> Spaces
    Reports --> WS
    WS --> Board
```

Key properties:
- **One Viber, many tasks.** A single Viber can host multiple tasks with distinct roles.
- **Process-stateless Viber.** The Viber holds no in-memory state between requests; durable context lives on disk.
- **Config ≠ working data.** `~/.openviber/` holds config and identity (small, portable). `~/openviber_spaces/` holds repos, research, and outputs (large, git-managed).

---

## 3. Storage Layout

OpenViber separates **config** from **working data** across two locations:

### Config (`~/.openviber/`) — lightweight, portable

```
~/.openviber/
├── config.yaml               # Viber: daemon, providers, channels, security
├── user.md                    # Shared: who you are (same for all tasks)
├── skills/                    # Viber: shared skill bundles
├── mcp/                       # Viber: MCP server configs
└── vibers/
    ├── dev.yaml               # Task config: model, tools, skills, mode, budget
    ├── dev/
    │   ├── soul.md            # Persona for this task
    │   ├── memory.md          # Long-term memory
    │   └── sessions/          # Conversation logs (*.jsonl)
    ├── researcher.yaml
    └── researcher/
        ├── soul.md
        ├── memory.md
        └── sessions/
```

### Working Data (`~/openviber_spaces/`) — large, git-managed

```
~/openviber_spaces/
├── my-webapp/                 # Cloned repo (dev-task works here)
├── data-pipeline/             # Another repo
├── market-research/           # Research task workspace
└── weekly-reports/            # Reporting task output
```

### Scoping rules

| Scope | What | Why |
|-------|------|-----|
| **Viber** | `config.yaml`, `user.md`, `skills/`, `mcp/` | Shared across all tasks on this machine |
| **Task** | `vibers/{id}.yaml`, `soul.md`, `memory.md`, `sessions/` | Each task has its own role, memory, and history |
| **Space** | `~/openviber_spaces/*` | Multiple tasks can work on the same space |

Tasks declare which spaces they work on:

```yaml
# ~/.openviber/vibers/dev.yaml
spaces:
  - ~/openviber_spaces/my-webapp
  - ~/code/legacy-api           # can point anywhere
```

The Viber reads and writes config but remains process-stateless — restart freely without losing context.

---

## 4. Working Modes

OpenViber exposes familiar autonomy profiles:

| Mode | Description |
|------|-------------|
| **Always Ask** | Viber asks before each execution action. |
| **Viber Decides** | Active execution within policy-based approval boundaries. |
| **Always Execute** | High autonomy; intervene by exception. |

All modes share one loop: **observe → plan → execute → verify → report → request feedback → continue**.

---

## 5. Human Control Model

The operator always has oversight:

- **Chat** is the default intervention path — pause, resume, reprioritize, re-scope.
- **Terminal observability** via tmux streaming — watch what the viber does in real time.
- **Approval gates** for sensitive actions (file writes, deploys, sends).
- **Budget limits** prevent runaway costs.
- **Audit trail** — every action is logged to session JSONL.

---

## 6. Verification Model

Acceptance must come from human-observable evidence, not self-grading:

- Browser/app interactions
- Terminal output
- Screenshots, logs, URLs, commands
- Reports with claims linked to proof

---

## 7. Multi-Task Coordination

When multiple tasks run on one Viber, they coordinate through **external systems**, not direct messaging:

```
researcher-task → writes report → GitHub issue (state:needs-triage)
pm-task         → triages issue → labels state:ready-for-dev
dev-task        → implements    → opens PR (Fixes #...)
comms-task      → announces     → GitHub release + email
```

This keeps each task **independent and stateless** — no inter-task protocol, no orchestration complexity. The handoff state machine lives in GitHub labels, not in OpenViber.

---

## 8. Viber Onboarding

Inspired by Cloudflare Zero Trust tunnels — the Board generates a one-liner that bootstraps and connects a new Viber.

### Flow

```mermaid
sequenceDiagram
    participant B as OpenViber Board
    participant U as User
    participant V as Target Machine (Viber)

    U->>B: Click "Add Viber"
    B->>B: Generate Viber ID + one-time token
    B->>U: Show command in dialog
    U->>V: Paste & run command
    V->>V: npx openviber connect --token <TOKEN>
    V->>B: WebSocket handshake (token auth)
    B->>V: Viber registered ✓
```

### The Command

```bash
npx openviber connect --token eyJub2RlIjoiYTFiMmMz...
```

This single command:
1. Installs/updates OpenViber (via `npx`)
2. Creates `~/.openviber/` with the Viber config
3. Registers the Viber with the Board using the embedded token
4. Starts the Viber runtime and connects via WebSocket

### Security Properties

| Property | How |
|----------|-----|
| **One-time token** | Expires after first use or after TTL |
| **No inbound ports** | Viber connects outbound to the Board |
| **Device binding** | After initial connect, device ID is pinned |
| **Revocable** | Board can revoke Viber access at any time |

---

## 9. Gateway (Central Coordinator)

After onboarding, the Viber communicates with the Viber Board (web app) via a WebSocket control plane.
In this repo, that control plane is implemented by the **Gateway** (`viber gateway`). This is distinct
from the **Channels** server (`viber channels`, enterprise channel webhooks) and from the **Viber runtime**
(often called the daemon).

- **Single gateway per host** — one Viber is the authority for channel connections and tasks run on that machine.
- **WebSocket control plane** — all clients (Board, CLI, automation) connect over a typed WS protocol, declaring **role + scopes** at handshake.
- **Idempotency keys** for side-effecting requests to allow safe retries.
- **Events are push-only** — clients must refresh state on gaps; events are not replayed.
- **Remote access** — VPN/Tailscale or SSH tunnel to the gateway, reusing the same token.

---

## 10. Design Principles

1. **Config ≠ working data** — `~/.openviber/` for config, `~/openviber_spaces/` for work.
2. **Process-stateless** — the Viber can restart at any time without data loss.
3. **Role-scoped tasks** — each task has a clear role, not a generic all-purpose agent.
4. **External coordination** — tasks coordinate through tools (GitHub, email), not inter-task messaging.
5. **Human oversight** — operators can always observe, intervene, and approve.
6. **Evidence-based verification** — no unverifiable self-grading.
7. **Token-based onboarding** — zero inbound ports, one command to connect.
