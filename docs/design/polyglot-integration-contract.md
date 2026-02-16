---
title: "Polyglot Integration Contract"
description: "Stable contracts for integrating non-TypeScript workers/tools into OpenViber"
---

# Polyglot Integration Contract

This document defines the minimum contracts required when integrating non-TypeScript components (e.g., Python workers, external executors, or sidecar services) into OpenViber.

> Goal: keep OpenViber's current architecture elegance (clear boundaries, deterministic behavior, and typed interfaces) while enabling polyglot runtime extensions.

## 1) Scope and boundaries

Polyglot components are treated as **edge adapters**, not core orchestrators.

- Core orchestration remains in `src/daemon` and `src/worker`.
- Polyglot services must communicate through explicit protocol boundaries.
- No direct cross-runtime shared mutable state.

## 2) Transport contract

Allowed transports:

- Local process stdio (preferred for tool-style integrations)
- HTTP/JSON (for sidecar services)
- WebSocket (for streaming/event-driven integrations)

Requirements:

- UTF-8 encoded payloads.
- Explicit request/response correlation via `requestId`.
- Each response includes `status` (`ok` | `error`).

Example envelope:

```json
{
  "requestId": "req_123",
  "status": "ok",
  "data": { "result": "..." },
  "error": null
}
```

## 3) Event schema contract

All event streams must use a normalized event envelope:

```json
{
  "eventId": "evt_123",
  "requestId": "req_123",
  "timestamp": "2026-02-12T12:34:56.000Z",
  "type": "text-delta",
  "payload": {}
}
```

Rules:

- `eventId` must be unique per stream.
- `timestamp` must be ISO-8601 UTC.
- `type` should map to OpenViber event semantics (e.g., `text-delta`, `tool-call`, `tool-result`, `state-change`, `error`, `done`).
- Event ordering must be preserved per `requestId`.

## 4) Tool contract

For externally executed tools:

- Input schema and output schema must be explicit and versioned.
- Tool calls must be deterministic for the same input and context unless marked non-deterministic.
- Side effects must be declared (`filesystem`, `network`, `external-api`, `process`).

Minimum metadata:

```json
{
  "name": "tool-name",
  "version": "1.0.0",
  "inputSchema": {},
  "outputSchema": {},
  "sideEffects": ["filesystem"]
}
```

## 5) Retry and idempotency

- Retries are opt-in and policy-driven.
- Integrations must support idempotency keys for mutation operations.
- Timeout defaults must be explicit and documented.

Recommended baseline:

- Timeout: 30s default, integration-specific override allowed.
- Retries: max 2 for transient failures.
- Backoff: exponential with jitter.

## 6) Error contract

Errors must be structured:

```json
{
  "status": "error",
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "...",
    "retryable": true,
    "details": {}
  }
}
```

Rules:

- `code` is stable and machine-consumable.
- `retryable` must be present.
- Sensitive details must be redacted.

## 7) Security and trust boundaries

- Principle of least privilege for credentials and filesystem scope.
- Secrets are injected via environment/runtime secret store, never hardcoded.
- All external requests should use allowlisted domains where feasible.
- Logs must avoid secret leakage.

## 8) Observability

Every integration should emit:

- `requestId`, `integrationName`, `operation`, `durationMs`, `status`.
- Error counters by `error.code`.
- Optional tracing spans where supported.

## 9) Versioning and compatibility

- Contract versions must be semver-like and explicit.
- Breaking changes require a new version and migration notes.
- During migration windows, support previous contract version when feasible.

## 10) Adoption checklist

When introducing a polyglot integration:

1. Define contract schema and version.
2. Add conformance tests for envelope, ordering, and errors.
3. Document retries/timeouts/idempotency behavior.
4. Validate security and secret handling.
5. Add operational runbook entries.

## Related docs

- `docs/design/protocol.md`
- `docs/design/streaming.md`
- `docs/design/error-handling.md`
- `docs/design/security.md`
