# OpenViber vs AionUi: Improvement Backlog (Issue Drafts)

Date: 2026-02-15

## Comparison method

I compared OpenViber docs and repository structure with AionUi (`iOfficeAI/AionUi`) to identify practical improvements we can port.

### Commands used

- `git clone --depth 1 https://github.com/iOfficeAI/AionUi /tmp/AionUi`
- `cd /tmp/AionUi && rg --files | head -n 120`
- `cd /tmp/AionUi && sed -n '1,280p' readme.md`
- `cd /tmp/AionUi && sed -n '1,240p' WEBUI_GUIDE.md`
- `cd /workspace/openviber && sed -n '1,240p' docs/design/openclaw-feature-comparison.md`
- `cd /workspace/openviber && sed -n '1,220p' docs/reference/openviber-vs-nanobot.md`

---

## Issue 1 — Add CLI Tool Auto-Discovery + Readiness Panel

**Why from AionUi:** AionUi highlights auto-detection of locally installed CLI agents and presents a unified interface for them.

**Problem in OpenViber:** OpenViber has strong runtime abstractions, but onboarding still assumes operators know what providers/tools are installed and healthy.

**Proposed issue body:**

- Add runtime probes for common local agent CLIs (e.g., codex, claude code, qwen code, goose).
- Surface detected binaries, versions, and basic health in Viber Board.
- Mark capabilities as `ready`, `partial`, `missing deps`, `not found`.
- Expose probe results through Gateway API for CLI and web parity.

**Acceptance criteria:**

- Detection API endpoint returns normalized probe schema.
- Viber Board shows readiness status cards before task launch.
- Missing dependency states include suggested install command.

**Suggested labels:** `enhancement`, `web`, `gateway`, `onboarding`

---

## Issue 2 — Build a Remote Access Quickstart (Web + Reverse Proxy)

**Why from AionUi:** AionUi includes a dedicated WebUI remote-access startup guide.

**Problem in OpenViber:** We document local URLs well, but we lack a one-stop operator guide for safe remote access patterns.

**Proposed issue body:**

- Add a guide covering LAN-only, reverse-proxy (Caddy/Nginx), and tunnel options.
- Include auth/session hardening checklist and TLS defaults.
- Provide compose snippets and smoke-test commands.

**Acceptance criteria:**

- New `docs/guides/remote-access.md` added.
- Includes at least one production-ish reverse proxy example.
- Includes explicit security warnings for public exposure.

**Suggested labels:** `docs`, `security`, `operator-experience`

---

## Issue 3 — Add Rich Artifact Preview Matrix in Viber Board

**Why from AionUi:** AionUi emphasizes previewing many artifact/file formats directly in UI.

**Problem in OpenViber:** Task outputs are visible, but preview ergonomics across common document types are not yet first-class.

**Proposed issue body:**

- Add preview adapters for Markdown, code, images, PDF, CSV/TSV, and JSON artifacts.
- Add a fallback download-open flow for unsupported types.
- Add MIME-aware viewer selection with extension fallback.

**Acceptance criteria:**

- Preview opens inline for at least 6 common types.
- Viewer choice is deterministic and test-covered.
- Unsupported artifacts clearly show fallback action.

**Suggested labels:** `enhancement`, `web`, `artifacts`

---

## Issue 4 — Upgrade Scheduled Jobs UX with Natural Language + Validation

**Why from AionUi:** AionUi focuses strongly on easy scheduled automation workflows.

**Problem in OpenViber:** Job power is present, but UX can improve for non-expert cron users and for safety checks.

**Proposed issue body:**

- Add natural-language schedule parser suggestions (e.g., “every weekday at 9am”).
- Show parsed cron + timezone + next 5 execution times before save.
- Add guardrails for high-frequency jobs.

**Acceptance criteria:**

- Job create/edit flow supports NL helper input.
- UI displays parsed cron and upcoming runs.
- Validation blocks obviously dangerous schedules without confirmation.

**Suggested labels:** `enhancement`, `web`, `jobs`

---

## Issue 5 — Create a First-Class Assistant/Skill Catalog Page

**Why from AionUi:** AionUi showcases packaged assistants and built-in skills with clear discoverability.

**Problem in OpenViber:** Skills are powerful, but discoverability and guided onboarding can be better for operators.

**Proposed issue body:**

- Add a catalog screen with skill metadata, prerequisites, and examples.
- Add health status (installed, missing deps, failing checks).
- Add “attach to task” quick action from catalog entries.

**Acceptance criteria:**

- Catalog renders all available skills with filter/search.
- Each skill card shows status + usage summary.
- Operator can add selected skills during task creation in ≤2 clicks.

**Suggested labels:** `enhancement`, `web`, `skills`, `ux`

---

## Issue 6 — Add Multi-Task Workspace Layouts (Split/Tabbed)

**Why from AionUi:** AionUi emphasizes parallel sessions and context isolation in one operator surface.

**Problem in OpenViber:** Multi-task capability exists, but fast comparison/supervision across active tasks can be improved.

**Proposed issue body:**

- Add split view and tab groups for task chats.
- Keep per-task context boundaries explicit in UI.
- Add quick switcher for active/erroring tasks.

**Acceptance criteria:**

- Operator can open 2+ tasks side by side.
- Task identity and state remain unambiguous in split mode.
- Keyboard quick switch works for active tasks.

**Suggested labels:** `enhancement`, `web`, `tasks`, `ux`

---

## Issue 7 — Add Pairing UX for External Chat Channels

**Why from AionUi:** AionUi uses pairing patterns for chat-platform access and remote operation.

**Problem in OpenViber:** Channel integrations exist, but operator-facing pairing/setup workflows are less standardized.

**Proposed issue body:**

- Define a channel pairing protocol (token/code expiry, revoke, audit fields).
- Add Board UI for issuing/revoking pairing codes.
- Add backend event logs for pairing lifecycle.

**Acceptance criteria:**

- Pairing endpoints documented and implemented for at least one channel.
- UI supports create/revoke/view pairing states.
- Pairing attempts are auditable.

**Suggested labels:** `enhancement`, `channels`, `security`, `web`

---

## Issue 8 — Implement `viber doctor` Health Diagnostics Command

**Why from AionUi:** AionUi and related ecosystems highlight operator-friendly diagnostics.

**Problem in OpenViber:** Troubleshooting still requires manual checks across env, ports, dependencies, and credentials.

**Proposed issue body:**

- Add `viber doctor` with grouped checks: env, ports, provider keys, runtime directories, channel configs.
- Output machine-readable JSON and human-readable table.
- Include “fix hints” per failing check.

**Acceptance criteria:**

- Command exits non-zero on critical failures.
- JSON mode can be used in CI and scripts.
- At least 12 checks across runtime and integrations are covered.

**Suggested labels:** `enhancement`, `cli`, `ops`, `reliability`

---

## Issue 9 — Add Web Localization Foundation (i18n)

**Why from AionUi:** AionUi invests in multilingual documentation and accessibility to global operators.

**Problem in OpenViber:** Core docs include Chinese and English readmes, but Board UI localization strategy is not yet explicit.

**Proposed issue body:**

- Add i18n framework integration in web app.
- Extract user-facing strings and provide `en` + `zh-CN` baseline packs.
- Add language selector in user settings.

**Acceptance criteria:**

- No hardcoded UI strings in top-level routes.
- Language choice persists per user/session.
- At least English and Simplified Chinese are fully usable for critical flows.

**Suggested labels:** `enhancement`, `web`, `i18n`

---

## Issue 10 — Publish an “Operator Day-2 Playbook”

**Why from AionUi:** AionUi invests heavily in practical operation guides for different environments.

**Problem in OpenViber:** Architecture docs are strong, but day-2 operations (backup/restore, upgrades, incident flow) deserve one consolidated runbook.

**Proposed issue body:**

- Document routine ops: upgrades, backup/restore, incident triage, log collection, rollback.
- Add checklists for self-hosted and single-machine deployments.
- Include expected SLO-style probes for gateway/web/channel services.

**Acceptance criteria:**

- New runbook added under `docs/guides/`.
- Includes command snippets for all core operational tasks.
- Linked from onboarding and introduction docs.

**Suggested labels:** `docs`, `ops`, `reliability`

---

## Priority recommendation

1. Issue 1 (auto-discovery)
2. Issue 8 (`viber doctor`)
3. Issue 3 (artifact previews)
4. Issue 5 (skill catalog)
5. Issue 4 (jobs UX)
6. Issue 2 (remote access guide)
7. Issue 6 (multi-task layouts)
8. Issue 7 (pairing UX)
9. Issue 10 (day-2 playbook)
10. Issue 9 (i18n)

This sequence prioritizes onboarding speed, operability, and day-to-day usability before larger surface-area expansions.
