---
title: "OpenViber Philosophy"
description: "Viber as a subordinate: Always Ask / Agent Decides / Always Execute, evidence-first execution, and workspace-first context"
---

# OpenViber Philosophy

OpenViber is built around one core idea: **a viber is a subordinate companion for one human**.

A **viber** is not only an LLM process. It is the combination of:

1. **ViberAgent** (reasoning + planning + execution),
2. **a work machine** (files, terminal, browser, apps),
3. **configured user context** (accounts, preferences, limits, identity).

The OpenViber project provides the platform. Each deployed viber is the working unit: a real teammate that produces verifiable outcomes on one machine.

## 1) The Manager <-> Subordinate Contract

The relationship should be explicit:

- The **manager** sets objectives, boundaries, and priorities.
- The **viber** executes, verifies, reports, and escalates decisions.

This is not a "prompt toy" model. It is an operating contract: the viber should behave like a dependable employee, not an improv partner.

## 2) Execution Modes (Tool Autonomy)

OpenViber uses three user-facing execution modes, aligned with common AI IDE behavior:

- **Always Ask**: viber does analysis and proposals, but asks before every execution action.
- **Agent Decides**: viber executes routine actions within policy and escalates high-risk/ambiguous actions.
- **Always Execute**: viber executes end-to-end within configured boundaries and reports progress continuously.

These modes are policies on top of the same agent architecture. In every mode, OpenViber still relies on the same plan/context, memory, verification, and reporting model.

Practical intuition:

- **Always Ask** feels like a responsible operator who stays idle unless asked.
- **Agent Decides** feels like an ambitious employee who keeps finding and finishing useful work.
- **Always Execute** feels like a trusted delegate: hands off, but auditable and interruptible.

## 3) Task Origins (Assigned vs Self-Initiated)

Every task should be clear about its origin:

- **Manager-assigned**: explicit request with acceptance criteria.
- **Self-initiated**: discovered by the viber from the mission and workspace signals (issues, failures, TODOs, drift).

Execution mode controls how the viber runs tools. A separate policy controls whether self-initiated work is allowed at all.

## 4) Operating Loop (Evidence-First)

The core loop is:

`observe -> plan -> execute -> verify -> report -> ask feedback -> continue`

Evidence is part of the loop, not a bonus:

- "done" means the manager could reproduce the result (commands, URLs, screenshots, logs).
- claims without evidence are treated as unfinished work.

## 5) Guardrails Make Proactivity Feasible

Autonomy should reduce manager load, not create surprise:

- Do not invent work outside mission scope.
- Prefer small, reversible steps with visible progress.
- Stop and escalate when confidence is low or blast radius is high.
- If no high-value action is clear, ask for prioritization instead of churning.

## 6) Budget and Policy Are First-Class

The viber should always carry constraint context:

- global and per-provider budgets,
- soft warnings and hard stops,
- tool allowlists/denylists,
- quiet hours and rate limits.

Even in **Always Execute**, "within configured boundaries" is the whole point. It is never "do whatever".

## 7) State Model (Workspace-First, Daemon Stateless)

OpenViber is built for open environments. Durable context must be explicit and owned, not hidden in a long-running process.

- **Viber Board** owns conversation and sends the full request context per run.
- **Work machine workspace** (typically `~/.openviber/`) holds durable files: plans, logs, artifacts, operating notes.
- The **daemon** remains process-stateless between requests.

All three execution modes still rely on memory and workspace context; what changes is tool autonomy, not the need for context.

## 8) Manager-Friendly Communication

When the viber needs manager input, default to structured, low-friction asks:

Example:

- "Which launch strategy should we use next?"
  - A (recommended): Ship internal alpha this week
  - B: Pause and improve reliability first
  - C: Expand scope before any release

Reports should be short and evidence-rich:

- what changed,
- what is next,
- what is blocked (with options),
- where the proof is (paths/links/logs).

## 9) Product Direction

OpenViber is not just a general toolkit. It is a **human-subordinate operating system** that can scale from supervised execution to trusted delegation without sacrificing control.

That is the standard: a useful daily subordinate now, and increasingly capable over time.
