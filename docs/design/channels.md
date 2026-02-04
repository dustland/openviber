---
title: "Channels"
description: "How OpenViber reports and receives instructions across chat/email surfaces"
---

# Channels

Channels are transport surfaces between a manager and one or more vibers.  
They should not be the source of truth for work context; workspace files under `~/.openviber/` are.

## 1. Channel goals

- deliver instructions to vibers,
- deliver periodic progress reports,
- deliver escalation questions,
- allow manager intervention quickly.

## 2. Supported interaction styles

- **Interactive chat** (primary): assign, redirect, approve, stop.
- **Email reports** (periodic): daily/weekly summaries and blockers.
- **Board web UI**: task/terminal visibility and artifact browsing.

## 3. Behavioral rules

- Channel switch must not lose context (context comes from workspace).
- Reports should include evidence refs, not only narrative summaries.
- Feedback requests should default to multiple-choice options.

## 4. Status reporting contract

Every periodic update should include:

- objective progress,
- current plan pointer,
- blockers requiring human input,
- budget usage and runway,
- link/refs to proof (terminal snippets, artifact paths, screenshots).
