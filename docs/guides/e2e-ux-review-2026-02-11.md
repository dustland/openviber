# OpenViber E2E UX Review — Redo on Latest Pull

Date: 2026-02-11 (rerun)
Reviewer: AI agent (Playwright-based browser testing)
Scope: End-to-end UX validation in E2E mode with emphasis on a proactive-agent, chat-first product strategy.

## What changed in this redo

This review replaces the prior pass and re-runs browser checks on the **latest code pull**. It expands route coverage and includes updated observations from the current build.

## Test setup and method

- Installed dependencies and launched full stack in E2E mode: `E2E_TEST_MODE=true pnpm dev`.
- Verified synthetic auth session via: `curl http://localhost:6006/auth/test-session`.
- Browser-tested these routes:
  - Core: `/`, `/chat`, `/vibers`, `/vibers/new`, `/tasks`
  - Ops & platform: `/nodes`, `/environments`, `/jobs`, `/skills`, `/logs`
  - Settings: `/settings/general`, `/settings/integrations`, `/settings/intents`, `/settings/channels`
- Collected screenshots and server/runtime error signals.

## Executive assessment

OpenViber is moving in a strong direction for operator tooling (clear navigation, intent templates, channels/intents/settings surfaces), but it is still **not yet chat-first reliable** in this test run.

The highest-risk blockers to the product vision remain:

1. Core conversational surface (`/chat`) still fails with a generic error state.
2. Task surface (`/tasks`) still fails, breaking the proactive feedback loop.
3. Node/observability surfaces show partial failure patterns (`/nodes` error page, `/logs` HTTP 500 state).
4. External configuration dependency failures (Supabase connectivity / ENETUNREACH) leak directly into user-facing workflows.

If the goal is “perfect proactive agent driven and chat focused,” the product needs a robust **degraded-mode chat cockpit** where users can always operate, even when dependencies are unavailable.

## Route-by-route UX findings (latest pull)

### ✅ Healthy / mostly healthy

- `/` Dashboard
  - Good hierarchy, clear entry points, and quick-access cards.
  - Helpful for orientation, but still secondary to a chat-first experience.

- `/vibers`
  - Clear list/empty-state shell and straightforward CTA to create a viber.

- `/vibers/new`
  - Intent-first onboarding is a strong concept and aligns with goal-oriented agent setup.

- `/jobs`
  - Directionally good for proactive automation narrative.
  - Empty-state copy is understandable and concrete.

- `/skills`
  - Useful split between installed skills and discovery/import.

- `/settings/general`
  - Mature control-plane feel (providers/model/CLI/timezone).

- `/settings/intents`
  - Strong strategic feature: user-manageable intent templates for agent bootstrap.

- `/settings/channels`
  - Good framing for chat-app connectivity as a first-class concern.

### ⚠️ Partially degraded but recoverable UX

- `/environments`
  - Route renders shell and concept, but data load fails (`Failed to load environments`).
  - Good that the page remains visible; needs stronger inline troubleshooting and fallback actions.

- `/settings/integrations`
  - Page renders with domain-specific message (`Failed to load integrations`).
  - Better than a full crash, but still lacks guided remediation steps and test controls.

- `/logs`
  - Surface appears, but shows `HTTP 500` + `Try again` states.
  - Logs should be a reliability anchor; this undermines operator trust.

### ❌ Critical broken UX

- `/chat`
  - Generic “Something went wrong” page.
  - This is the biggest product contradiction vs. a chat-focused strategy.

- `/tasks`
  - Same generic failure pattern as chat.
  - Breaks proactive pipeline visibility and approval loops.

- `/nodes`
  - Generic error page.
  - Weakens confidence in distributed/daemon runtime operations.

## Runtime and reliability observations

During this run, two recurring reliability signals were observed:

1. Repeated viber controller reconnect loop with `socket hang up`.
2. Web-side Supabase fetch failures including connectivity/network errors (`ENETUNREACH`) causing server 500 responses on some UX paths.

From a UX perspective, these are expected realities in local/dev and hybrid setups — so the product needs first-class resilience UX, not just happy-path rendering.

## Prioritized recommendations (chat-first, proactive-agent focused)

## P0 — Non-negotiable foundations

1. **Always-on Chat Shell (degraded mode).**
   - Keep `/chat` interactive even when APIs fail.
   - Provide queued sends, local draft context, reconnect controls, and dependency status panel.

2. **Stabilize critical routes with route-specific error boundaries.**
   - `/chat`, `/tasks`, `/nodes` should never land on generic global error pages.
   - Replace with domain recovery actions: reconnect, diagnose, open setup checklist, run in local-only mode.

3. **Unified dependency health center.**
   - Centralized panel for Supabase/gateway/viber/node health.
   - Show exact failing checks and one-click re-test.

4. **Proactive Inbox as default home.**
   - Merge: pending tasks, approvals needed, clarifications, active chats, latest autonomous runs.

5. **Error semantics that teach users what to do next.**
   - Every failure card should include: cause class, impact, safe next action.

## P1 — High impact product shaping

6. **Chat/task deep-link architecture.**
   - Every task has “open in chat thread”; every chat plan has a linked structured task object.

7. **Autonomy control UX per viber.**
   - Mode selector: Suggest-only / Safe-auto / Full-auto.
   - Attach budgets and policy boundaries to each mode.

8. **Human-in-the-loop approval ergonomics.**
   - Batch approve/reject/defer.
   - “Approve this class of action for 24h” shortcuts.

9. **Mission templates from intents.**
   - Convert intent cards into runnable mission plans with expected outputs and review points.

10. **First-run setup assistant inside chat.**
    - If dependencies are missing, chat agent should guide user through setup interactively.

11. **Provenance and memory explainability.**
    - “Why did the agent suggest this?” backed by source links, confidence, and recency.

12. **Operator trust UI.**
    - Add risk levels and blast-radius estimates before execution.

## P2 — Advanced differentiators

13. **Daily proactive briefing in chat.**
    - “What changed overnight, what is blocked, what needs your decision.”

14. **Cross-viber orchestration commands.**
    - In chat: route work across specialist vibers with handoff summaries.

15. **Outcome quality learning loop.**
    - Lightweight post-action rating to tune future behavior.

16. **Mobile triage mode.**
    - Rapid approve/reject/defer workflow for proactive notifications.

17. **Timeline unification.**
    - Merge logs/jobs/task events into one explainable activity stream.

18. **Resilience simulation mode.**
    - Let users intentionally test degraded modes (e.g., “simulate database outage”) to build trust.

## Product north-star (target experience)

A successful experience should feel like this:

1. User lands in one conversational command center.
2. Agent proposes prioritized proactive actions with clear rationale.
3. User approves in-thread; execution streams live status and evidence.
4. Results return with artifacts, diffs, and recommended next action.
5. If dependencies fail, operation continues in a graceful fallback path, never dead-ending the user.

## Suggested UX metrics to track

- Chat availability uptime (including degraded mode)
- % sessions that complete a meaningful action without leaving chat
- Time-to-first-successful-proactive-action
- Failure recovery time from dependency outage
- Approval-to-execution latency
- User trust indicators (autonomy mode adoption, rollback frequency)

## Screenshot artifacts (latest run)

### Core product

- Dashboard: `browser:/tmp/codex_browser_invocations/3b9f2cbcdb22ae0a/artifacts/artifacts/r1_dashboard.png`
- Chat (error state): `browser:/tmp/codex_browser_invocations/3b9f2cbcdb22ae0a/artifacts/artifacts/r1_chat.png`
- Vibers: `browser:/tmp/codex_browser_invocations/3b9f2cbcdb22ae0a/artifacts/artifacts/r1_vibers.png`
- New viber (intent view): `browser:/tmp/codex_browser_invocations/3b9f2cbcdb22ae0a/artifacts/artifacts/r1_vibers_new.png`
- Tasks (error state): `browser:/tmp/codex_browser_invocations/3b9f2cbcdb22ae0a/artifacts/artifacts/r1_tasks.png`

### Ops + settings

- Nodes (error state): `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_nodes.png`
- Environments (partial load failure): `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_environments.png`
- Jobs: `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_jobs.png`
- Skills: `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_skills.png`
- Logs (HTTP 500 state): `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_logs.png`
- Settings / General: `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_settings_general.png`
- Settings / Integrations: `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_settings_integrations.png`
- Settings / Intents: `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_settings_intents.png`
- Settings / Channels: `browser:/tmp/codex_browser_invocations/c0791461e6f053a5/artifacts/artifacts/r2_settings_channels.png`
