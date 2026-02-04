---
title: "Viber Daemon"
description: "Runtime contract for one viber: execution, reporting, budgets, and intervention"
---

# Viber Daemon

The daemon is the runtime for one **viber** (one machine companion).  
It executes tasks, updates local workspace state, and reports to the OpenViber Board.

## 1. Responsibilities

- Receive goals/messages from Board (or optional hub relay).
- Load local context from `~/.openviber/` (plan, memory, persona, budgets, account context).
- Execute with skills/tools on the local machine.
- Stream terminal state (`terminal:*`) for observability.
- Return periodic progress and final reports with evidence refs.

## 2. Non-responsibilities

- No hidden in-memory project state that vanishes correctness on restart.
- No Board-owned-only context dependency.
- No fake/self-asserted verification without evidence.

## 3. Runtime contract

Input:

- `goal`, `messages`
- optional `plan`, `artifacts`, `memory excerpts`, `budget context`

Output:

- progress events and/or periodic summaries
- final report `{ summary, conclusion, artifactRefs, verificationRefs }`
- explicit escalation requests when blocked

## 4. Budget-aware execution

Before expensive calls, daemon should evaluate:

- remaining monthly budget,
- per-provider/model limits,
- policy thresholds (warn/stop).

Routing/model choices should prefer lower-cost paths when they satisfy quality constraints.

## 5. Feedback protocol

When user judgment is needed, daemon should ask compact multiple-choice questions rather than vague free-form prompts.  
This supports fast managerial decisions in chat.

## 6. Observability and intervention

- tmux panes are streamable to Board (`terminal:list/attach/output/input/detach/resize`).
- Human can intervene by chat commands (reprioritize, stop, adjust scope).
- GUI operations needing direct window control are treated as VNC-class workflows, not default chat interaction.

## 7. Verification standard

Daemon should verify from human perspective:

- open the target UI when applicable,
- interact with key flows,
- capture proof (terminal logs/screenshots/URLs/steps),
- send conclusion with evidence references.

No claim is complete without clues that a human can reproduce.
