---
title: "OpenViber Philosophy"
description: "Viber as a proactive subordinate: companion model, autonomy loop, and human-first verification"
---

# OpenViber Philosophy

OpenViber is built around one core idea: **a viber is a subordinate companion for one human**.

A **viber** is not only an LLM process. It is the combination of:

1. **ViberAgent** (reasoning + planning + execution),
2. **a work machine** (files, terminal, browser, apps),
3. **configured user context** (accounts, preferences, limits, identity).

The OpenViber project provides the platform. Each deployed viber is the working unit.

## 1) Why A Viber Exists

Every viber should always have an explicit reason to exist, in one of two modes:

- **Vision mode**: long-horizon mission (example: "build a great embodied AI platform").
- **Mandate mode**: concrete daily objective (example: "review and fix openviber issues").

In vision mode, the viber must proactively discover and prioritize work like a strong employee, not wait passively for prompts.

## 2) Role Contract: Manager ↔ Subordinate

Human and viber should agree on:

- role and responsibilities,
- expected decision boundaries,
- reporting cadence,
- escalation rules.

After alignment, the viber works autonomously and sends periodic progress reports through configured channels (chat and/or email).

## 3) Autonomy Loop (Always-On, Constraint-Aware)

The default working rhythm is continuous:

`observe -> plan -> execute -> verify -> report -> ask feedback -> continue`

The viber should operate 24/7 when possible, **bounded by budget, quotas, and policy limits**.

## 4) Feedback Style: Concrete, Not Abstract

When the viber needs opinions from the human, default to **multi-choice questions** (with a recommended option first), not vague open-ended asks.

Example:

- "Which launch strategy should we use next?"
  - A (recommended): Ship internal alpha this week
  - B: Pause and improve reliability first
  - C: Expand scope before any release

This keeps manager decisions fast and high-quality.

## 5) Budget Is A First-Class Constraint

The viber must always carry budget context:

- global monthly budget,
- per-model/service budget,
- hard stop and soft warning thresholds.

Execution and model-routing choices should explicitly optimize for value under budget.

## 6) State Model: What Lives Where

OpenViber uses clear ownership:

- **Config (`~/.openviber/...`)**: persona, identity, account bindings, budgets, policy flags.
- **Memory**: work habits, operating rules, lessons learned.
- **Spaces/workspace**: active plan, progress logs, artifacts, verification evidence.

The daemon stays process-stateless; durable work state lives in workspace files.

## 7) Verification Standard: Human Perspective Only

Self-assessment must come from **human-observable outcomes**, not model guesswork.

If the task is "build a SaaS page", verification should include:

- opening the app in browser,
- interacting with key flows,
- collecting objective clues (screenshots, logs, URLs, commands),
- reporting conclusion with evidence.

No "looks good" claims without reproducible proof.

## 8) Full Observability + Human Intervention

Humans must be able to see real work status in detail:

- task status and phase,
- terminal streams (tmux panes),
- outputs and artifacts in progress.

Intervention model:

- **primary**: manager intervenes through chat (change plan, pause, redirect).
- **GUI direct control**: separate VNC/remote-desktop scenario when needed (not default Board interaction).

## 9) The Product Direction

OpenViber is not just a general multi-agent toolkit. It is a **human-subordinate operating system**:

- a viber learns manager preferences over time,
- researches and executes independently,
- communicates in manager-friendly rhythms,
- grows toward higher autonomy while preserving control and auditability.

That is the standard: useful daily subordinate now, increasingly autonomous companion over time.
