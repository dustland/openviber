# OpenViber Roadmap & Issues

This document tracks the "essential benefits" identified from the feature comparison with Nanobot.

## 🔴 P0 - Critical Gaps (To Do)

These features are critical for parity and developer experience.

- [ ] **Shell Execution Tool (`src/tools/shell.ts`)**
  - **Goal**: Add a secure `exec` or `shell_run` tool.
  - **Requirements**:
    - `restrictToWorkspace` flag (default true).
    - Regex-based deny list for dangerous commands (`rm -rf /`, `mkfs`, etc.).
    - Configurable timeout.
  - **Status**: Missing. Currently relies on `codex-cli` or `cursor-agent` skills.

- [ ] **More LLM Providers (`src/core/provider.ts`)**
  - **Goal**: Add native support for missing providers.
  - **Missing**: Google Gemini, Groq, Moonshot/Kimi, Zhipu GLM, vLLM (local).
  - **Status**: `gemini-cli` skill exists as a workaround, but native `provider` integration is missing.

- [ ] **Provider Registry Pattern**
  - **Goal**: Refactor `src/core/provider.ts` to use a registry pattern instead of a switch statement.
  - **Benefit**: Easier community contributions for new providers.

## 🟠 P1 - Important Features (To Do)

- [ ] **Subagent Spawning**
  - **Goal**: Allow agents to spawn background tasks/agents via a tool.
  - **Status**: Agents run in parallel but cannot spawn each other.

- [ ] **Consumer Messaging Channels**
  - **Goal**: Add channels for Telegram, Discord, and WhatsApp.
  - **Status**: Currently only supports Enterprise (DingTalk, WeCom).

- [ ] **Heartbeat / Proactive Agent**
  - **Goal**: Implement `HEARTBEAT.md` monitoring.
  - **Description**: Daemon should periodically read `HEARTBEAT.md` in the viber config dir for ad-hoc instructions without a cron schedule.

- [ ] **Daily Memory Logs**
  - **Goal**: Auto-create `memory/YYYY-MM-DD.md`.
  - **Description**: Append interaction summaries to a daily log file for organic memory growth.

- [ ] **Workspace Sandboxing**
  - **Goal**: Enforce `restrictToWorkspace` for all file/shell operations.
  - **Status**: Working modes exist, but filesystem access is unrestricted.

## 🟢 Absorbed / Completed

These features were identified as gaps but are now implemented or partially addressed.

- [x] **Onboarding Command** (`openviber onboard`)
  - Implemented in `src/cli/index.ts`.
- [x] **Status Command** (`openviber status`)
  - Implemented in `src/cli/index.ts`.
- [x] **Gemini Support** (Partial)
  - `gemini-cli` skill added to `src/skills/gemini-cli`.
- [x] **Enterprise Channels**
  - DingTalk and WeCom implemented in `src/channels/`.

## 🔵 Backlog (P2)

- [ ] **Docker Support**: Add `Dockerfile` and `docker-compose.yml`.
- [ ] **Gateway Mode**: Single command to run hub + channels + agent loop.
- [ ] **Structured Logging**: Replace `console.log` with a structured logger (e.g., `pino` or `winston`).
- [ ] **Voice Support**: STT/TTS integration.
