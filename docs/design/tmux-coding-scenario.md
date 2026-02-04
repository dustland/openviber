---
title: "Tmux Coding Scenario"
description: "Observe every viber terminal in web, intervene by chat, and verify real development outcomes"
---

# Tmux Coding Scenario

For coding tasks, chat-only systems are insufficient.  
OpenViber combines orchestration chat with live terminal observability.

## 1. Core model

| Capability | Purpose |
| --- | --- |
| Chat with viber | assign work, reprioritize, pause/resume, ask for reports |
| Tmux terminal streaming | see real execution for Codex/Cursor/dev servers/tests |

The manager should always be able to inspect what the subordinate is doing.

## 2. Current protocol

- `terminal:list`
- `terminal:attach`
- `terminal:output`
- `terminal:input`
- `terminal:resize`
- `terminal:detach`

This is a live I/O bridge between tmux panes and Board terminals.

## 3. Intervention policy

- **Primary intervention**: chat commands ("stop pane 2", "run tests now", "switch to cheaper model").
- **Secondary intervention**: direct terminal input when needed.
- **GUI control**: separate VNC-class flow, not default Board behavior.

## 4. Why this matters

- prevents "black box coding agent" failure mode,
- enables human steering during long runs,
- provides evidence for verification reports.

## 5. Verification linkage

Terminal streams are not only for monitoring; they are verification clues.
Final reports should reference concrete traces (commands, outputs, screenshots, URLs) so the manager can audit conclusions.
