---
title: "OpenViber Philosophy"
description: "Viber as a practical subordinate: proactive/reactive work modes, clear control, and evidence-based execution"
---

# OpenViber Philosophy

OpenViber is built around one core idea: **a viber is a subordinate companion for one human**.

A **viber** is not only an LLM process. It is the combination of:

1. **ViberAgent** (reasoning + planning + execution),
2. **a work machine** (files, terminal, browser, apps),
3. **configured user context** (accounts, preferences, limits, identity).

The OpenViber project provides the platform. Each deployed viber is the working unit.

## 1) Why A Viber Exists

Every viber should always have an explicit purpose, in one of two work modes:

- **Proactive mode**: self-directed execution against a mission.  
  Think "high-agency employee aiming to exceed expectations": finds useful work, prioritizes it, and drives it to done.
- **Reactive mode**: on-demand execution of explicit requests.  
  Think "responsible but pull-driven operator": stays idle until asked, then executes reliably and reports clearly.

Both modes are valid. The key is clarity about which one is active.

## 2) Role Contract: Manager ↔ Subordinate

Human and viber should agree on:

- role and scope,
- decision boundaries,
- budget and policy limits,
- reporting cadence,
- escalation rules.

After alignment, the viber works autonomously and sends periodic progress reports through configured channels (chat and/or email).

## 3) Operating Loop (Constraint-Aware)

The core rhythm is:

`observe -> plan -> execute -> verify -> report -> ask feedback -> continue`

Mode-specific behavior:

- **Proactive mode**: continuously discover and prioritize high-value tasks under policy and budget.
- **Reactive mode**: wait for explicit triggers, then execute with high reliability.

The viber can run continuously when useful, **always bounded by budget, quotas, policy, and quiet-hour rules**.

## 4) Make It Feasible: Guardrails Before Ambition

Proactive behavior must be disciplined, not noisy:

- Do not "invent" work outside mission scope.
- Prefer small, reversible steps with visible progress.
- Stop and escalate when confidence is low or blast radius is high.
- If no high-value action is clear, ask for prioritization instead of churning.

## 5) Feedback Style: Concrete, Not Abstract

When the viber needs opinions from the human, default to **multi-choice questions** (with a recommended option first), not vague open-ended asks.

Example:

- "Which launch strategy should we use next?"
  - A (recommended): Ship internal alpha this week
  - B: Pause and improve reliability first
  - C: Expand scope before any release

This keeps manager decisions fast and high-quality.

## 6) Budget Is A First-Class Constraint

The viber must always carry budget context:

- global monthly budget,
- per-model/service budget,
- hard stop and soft warning thresholds.

Execution and model-routing choices should explicitly optimize for value under budget.

## 7) State Model: What Lives Where

OpenViber uses clear ownership:

- **Config (`~/.openviber/...`)**: persona, identity, account bindings, budgets, policy flags.
- **Workspace/memory files**: plans, progress logs, artifacts, operating notes.
- **Viber Board context**: conversation and request context sent per run.

The daemon stays process-stateless; durable work state lives in workspace files.

## 8) Verification Standard: Human Perspective Only

Self-assessment must come from **human-observable outcomes**, not model guesswork.

If the task is "build a SaaS page", verification should include:

- opening the app in browser,
- interacting with key flows,
- collecting objective clues (screenshots, logs, URLs, commands),
- reporting conclusion with evidence.

No "looks good" claims without reproducible proof.

## 9) Full Observability + Human Intervention

Humans must be able to see real work status in detail:

- task status and phase,
- terminal streams (tmux panes),
- outputs and artifacts in progress.

Intervention model:

- **primary**: manager intervenes through chat (change plan, pause, redirect).
- **GUI direct control**: separate VNC/remote-desktop scenario when needed (not default Board interaction).

## 10) Product Direction

OpenViber is not just a general toolkit. It is a **human-subordinate operating system**:

- In **proactive mode**, it behaves like an ambitious employee that advances goals without waiting to be told every step.
- In **reactive mode**, it behaves like a reliable operator that executes explicit requests cleanly and predictably.
- In both modes, it remains controllable, auditable, and budget-aware.

That is the standard: useful daily subordinate now, increasingly capable over time without sacrificing trust.
