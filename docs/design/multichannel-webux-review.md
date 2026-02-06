# Multichannel & Web UI Implementation Plan

## Goal

Ship the concrete runtime capabilities required for:

1. chat-app-grade streaming UX,
2. multi-channel consistency,
3. intervention during in-flight generations, and
4. replay-friendly progress events for Web UI timelines.

---

## Scope Converted from Review -> Execution

This document is now an implementation plan with completed items marked.

## Phase 1 (Runtime + Protocol Foundations)

### 1. Progress event envelope (implemented)

Implemented in daemon/controller and hub ingestion:

- `eventId`
- `sequence`
- `taskId`
- `conversationId`
- `createdAt`
- `model` (optional)
- nested `event` payload (`text-delta`, `tool-call`, `tool-result`, `status`)

Result:

- Web/Board consumers now have stable ordering metadata and identifiers.
- Hub normalizes legacy progress payloads for backward compatibility.

### 2. Intervention message modes (implemented)

Implemented `task:message` behavior with three modes:

- `followup` (default): queue next user intervention turn
- `collect`: append to batch buffer, merged into a single next follow-up turn
- `steer`: enqueue as priority and interrupt current run to apply intervention

Result:

- Mid-run intervention is now executable in controller runtime.
- Existing stateless-daemon constraints are preserved by replaying full `messageHistory`.

### 3. Follow-up run loop (implemented)

Controller now keeps per-task runtime state and repeatedly executes until queues are drained:

- initial run
- dequeue intervention/follow-up message
- append as user message
- rerun with full accumulated message history

Result:

- Interventions no longer require manual stop + new submit from operator.

---

## Phase 2 (Web UX Contract)

### 4. Canonical timeline schema (next)

Define a board-facing schema for timeline rendering:

- message id
- role
- parts
- status
- model provenance
- usage summary

### 5. Reconnect/replay contract (next)

Add API support for:

- fetch from `sequence > N`
- periodic state snapshot

---

## Phase 3 (Multi-model UX)

### 6. Per-turn model selection (next)

Extend incoming message contract with per-turn `model` and keep model provenance in each assistant event/message.

### 7. Model routing policy (next)

Add configurable policy layer:

- user pin
- rule-based selection
- fallback chain

---

## Acceptance Status

### Done in this change set

- Progress events now carry ordering/envelope metadata.
- Hub supports both envelope and legacy event shapes.
- `task:message` supports `steer` / `followup` / `collect` behaviors.
- Controller can interrupt current run and continue with queued intervention messages.

### Remaining

- Board/web canonical timeline schema and replay endpoint.
- Per-turn multi-model orchestration and UI controls.
