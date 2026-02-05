---
title: "Design Philosophy of OpenViber"
description: "Viber as a Cowork Agent: Always Ask / Agent Decides / Always Execute, evidence-first execution, and workspace-first context"
---

# Design Philosophy of OpenViber

OpenViber is built on one claim: **a viber is a Cowork Agent — an autonomous teammate that works with you, not just for you**.

A viber is one working unit composed of:

1. **ViberAgent**: reasoning, planning, and execution.
2. **Work machine**: files, terminal, browser, and apps.
3. **User context**: identity, accounts, preferences, and limits.

If any part is missing, you do not have a viber. You have only a model.

## 1) The Manager ↔ Agent Contract

The relationship is explicit:

- The **manager** defines goals, constraints, and priorities.
- The **viber** executes, proves results, and escalates uncertainty.

This is not roleplay. It is an operating contract.

## 2) Execution Modes (Tool Autonomy)

Tool autonomy is a policy, not personality:

- **Always Ask**: analyze and propose, then ask before each action.
- **Agent Decides**: execute routine actions, escalate risky or ambiguous ones.
- **Always Execute**: execute end-to-end within policy boundaries and report continuously.

The architecture is unchanged across modes: context, memory, verification, and reporting still apply.

## 3) Task Origins (Assigned vs Self-Initiated)

Every task has an origin:

- **Manager-assigned**: explicit request with acceptance criteria.
- **Self-initiated**: discovered from mission and workspace signals (failures, TODOs, drift, open issues).

Execution mode controls *how* tools run. Policy controls *whether* self-initiated work is allowed.

## 4) Operating Loop (Evidence-First)

The loop is:

`observe → plan → execute → verify → report → ask feedback → continue`

Evidence is mandatory:

- "Done" means a manager can reproduce the result from commands, logs, URLs, or artifacts.
- Claims without evidence are incomplete.

## 5) Guardrails Make Proactivity Feasible

Autonomy must reduce managerial load, not increase surprise:

- Do not invent work outside mission scope.
- Prefer small, reversible steps with visible progress.
- Stop and escalate when confidence is low or blast radius is high.
- If no high-value move is clear, ask for prioritization.

## 6) Budget and Policy Are First-Class

Constraints are part of reasoning, not post-checks:

- Global and provider budgets.
- Soft warnings and hard stops.
- Tool allowlists and denylists.
- Quiet hours and rate limits.

Even in **Always Execute**, authority is bounded. There is no "do whatever" mode.

## 7) State Model (Workspace-First, Daemon Stateless)

Durable state must be explicit and inspectable.

- **Viber Board** owns conversation state and sends full request context per run.
- **Workspace** (typically `~/.openviber/`) stores plans, logs, artifacts, and notes.
- **Daemon** is stateless between requests.

Modes change autonomy, not the need for memory.

## 8) Manager-Friendly Communication

When input is needed, ask with structure and a recommendation:

Example:

- "Which launch strategy should we use next?"
  - A (recommended): Ship internal alpha this week
  - B: Pause and improve reliability first
  - C: Expand scope before any release

Reports should be brief and auditable:

- What changed.
- What is next.
- What is blocked, with options.
- Where evidence lives (paths, links, logs).

## 9) Product Direction

OpenViber is not a generic agent toolkit. It is a **Cowork Agent platform** — purpose-built for human-AI collaboration.

Its trajectory is clear: from supervised execution to trusted delegation, without surrendering control.
