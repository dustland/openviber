---
title: "Architecture"
description: "OpenViber architecture: viber unit, workspace ownership, autonomy loop, and intervention channels"
---

# Architecture

OpenViber is a workspace-first platform where each **viber** is a subordinate working unit on one machine.

## 1. The viber unit

A viber = `ViberAgent + work machine + configured user account context`.

```mermaid
flowchart LR
    subgraph Viber["One Viber (work machine)"]
      Agent["ViberAgent"]
      Machine["Machine runtime<br/>(tmux, browser, files, apps)"]
      Identity["Identity + accounts<br/>(github/google/app store/etc)"]
      Budget["Budget policy"]
    end

    Agent --> Machine
    Agent --> Identity
    Agent --> Budget
```

The project is **OpenViber**; the deployed machine companion is still called a **viber**.

## 2. System topology

```mermaid
flowchart LR
    subgraph Board["OpenViber Board (web cockpit)"]
      Chat["Chat"]
      Status["Task status"]
      Terms["Terminal panels (tmux)"]
      Reports["Reports / evidence"]
    end
    subgraph Hub["Hub (optional relay)"]
      WS["WS route"]
    end
    subgraph Local["Viber daemon (local)"]
      Runtime["Task runtime"]
      Skills["Skills + tools"]
      Bridge["tmux bridge"]
    end
    subgraph Store["~/.openviber (source of truth)"]
      Cfg["config/ persona / accounts / budgets"]
      Space["workspace (plan, progress, artifacts)"]
      Mem["memory (rules/habits)"]
      Sess["sessions (*.jsonl)"]
    end

    Chat --> WS
    WS --> Runtime
    Runtime --> Skills
    Runtime --> Store
    Bridge --> Terms
    Runtime --> Reports
    Reports --> WS
    WS --> Board
```

## 3. Storage ownership

- `~/.openviber/config` and agent files: identity, persona, account bindings, budget policies.
- `~/.openviber/workspace`: active plans, progress, and artifacts.
- `~/.openviber/memory`: work habits/rules and optional semantic indexes.
- `~/.openviber/agents/{id}/sessions/*.jsonl`: durable run/conversation logs.

The daemon remains process-stateless; durable context lives in files.

## 4. Working modes

- **Vision mode**: proactive, self-directed roadmap execution against a long-horizon mission.
- **Mandate mode**: concrete assignment execution with clear acceptance criteria.

Both modes share one loop: observe -> plan -> execute -> verify -> report -> request feedback -> continue.

## 5. Human control model

- Default intervention path is chat (pause/resume/reprioritize/re-scope).
- Full terminal observability comes from tmux streaming.
- GUI direct manipulation is out-of-band VNC/remote desktop, not direct Board window control.

## 6. Verification model

Acceptance must be evaluated from human-observable evidence:

- browser/app interactions,
- terminal output,
- screenshots/logs/URLs/commands,
- report with claims linked to proof.

No unverifiable self-grading.
