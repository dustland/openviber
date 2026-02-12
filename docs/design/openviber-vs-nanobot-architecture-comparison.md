---
title: "OpenViber vs Nanobot Architecture Comparison"
description: "Structural and architectural comparison demonstrating OpenViber's design advantages"
---

# OpenViber vs Nanobot Architecture Comparison

This document compares the project structure and architecture of **OpenViber** with **nanobot** (https://github.com/HKUDS/nanobot) to assess architectural elegance and coding practices.

---

## 1. Executive Summary

| Aspect | OpenViber | Nanobot |
|--------|-----------|---------|
| **Language** | TypeScript (full stack) | Python (core) + TypeScript (WhatsApp bridge) |
| **Core LOC** | ~31.7k (src/) | ~8.5k (nanobot/) |
| **Scope** | Full platform: web UI, gateway, daemon, multi-node | Single-node personal assistant |
| **Architecture** | Stateless nodes, gateway, config-driven | Monolithic gateway with message bus |

**OpenViber** is architecturally superior for a *deployment platform*: it has clear separation of concerns, a typed protocol, multi-node orchestration, and a document-driven design system. **Nanobot** is intentionally minimal (~4k lines for "core agent") and excels at *simplicity* and *research-readiness*—but it lacks the extensibility, governance, and operational maturity of OpenViber.

---

## 2. Project Structure Comparison

### OpenViber Structure

```
src/
├── cli/            # CLI entrypoints
├── daemon/         # Runtime, controller, scheduler, task lifecycle
├── gateway/        # Central coordinator (REST + WebSocket)
├── channels/       # Enterprise channel integrations (registry-based)
├── skills/        # Skill registry, hub providers, verification
├── tools/         # Built-in tools (shell, file, browser, schedule, etc.)
├── viber/         # Agent, provider, config, context, task, plan, tool abstractions
├── types/         # Shared types
└── utils/         # Logger, paths, security, id

docs/
├── design/        # viber, communication, protocol, task-lifecycle, memory, etc.
├── concepts/      # jobs, skills, tools, viber
├── reference/     # config-schema, glossary
└── getting-started/

web/               # SvelteKit frontend (Viber Board)
```

**Strengths:**
- Clear separation: daemon (runtime), gateway (coordinator), channels (pluggable), skills (registry-driven)
- Config-driven agents: no subclassing, YAML config
- Design docs: viber.md, task-lifecycle.md, communication.md, memory.md—all in `docs/design/`
- Structured personalization: three-file pattern (soul.md, user.md, memory.md)
- Skill registry with discovery, lazy loading, hub integration

### Nanobot Structure

```
nanobot/
├── agent/         # loop, context, memory, skills, subagent, tools
├── bus/           # events, queue (MessageBus)
├── channels/      # manager + per-channel (telegram, discord, dingtalk, etc.)
├── cron/          # scheduled tasks
├── heartbeat/     # proactive wake-up
├── providers/     # LLM base, litellm_provider, registry
├── session/       # conversation manager
├── config/        # loader, schema (Pydantic)
└── cli/           # commands
```

**Strengths:**
- Minimal: ~4k lines core agent code
- Message bus: async queue decouples channels from agent
- Simple bootstrap: AGENTS.md, SOUL.md, USER.md, TOOLS.md
- Many channels: Telegram, WhatsApp, Discord, Feishu, DingTalk, Slack, Email, QQ, Mochat

**Weaknesses:**
- Channel manager: hardcoded if-blocks for each channel (~40 lines per channel)
- No registry pattern for channels; adding a channel requires editing `manager.py`
- Single workspace: no multi-viber or multi-node concept
- Config schema: JSON, flat; no per-viber config

---

## 3. Architectural Elegance Comparison

### 3.1 Channel Abstraction

**OpenViber** uses a registry pattern:

```typescript
// channels/registry.ts - channels register themselves
register(channel: Channel): void {
  this.channels.set(channel.id, channel);
}

// Each channel implements Channel interface
interface Channel {
  id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  stream(conversationId: string, event: AgentStreamEvent): Promise<void>;
}
```

**Nanobot** uses a hardcoded `_init_channels()`:

```python
# channels/manager.py - 40+ lines of if blocks
if self.config.channels.telegram.enabled:
    try:
        from nanobot.channels.telegram import TelegramChannel
        self.channels["telegram"] = TelegramChannel(...)
    except ImportError as e:
        logger.warning(...)
# ... repeated for each channel
```

**Verdict:** OpenViber wins—channel registry is extensible without modifying core code.

---

### 3.2 Agent Abstraction

**OpenViber** uses config-driven agents:

```typescript
// viber/agent.ts - No subclasses, behavior from config
export class Agent {
  constructor(config: AgentConfig) {
    this.config = config;
    this.tools = config.tools || [];
    this.skills = config.skills || [];
    this.mode = config.mode ?? "agent_decides";
  }
  // ...
}
```

**Nanobot** uses a single `AgentLoop` with hardcoded tool registration:

```python
# agent/loop.py - Tools registered in __init__
def _register_default_tools(self) -> None:
    self.tools.register(ReadFileTool(allowed_dir=allowed_dir))
    self.tools.register(WriteFileTool(allowed_dir=allowed_dir))
    self.tools.register(ExecTool(...))
    self.tools.register(WebSearchTool(api_key=self.brave_api_key))
    # ...
```

**Verdict:** OpenViber wins—agents are defined by YAML, not code; multiple vibers with different roles per node.

---

### 3.3 Communication Protocol

**OpenViber** has a typed protocol:
- WebSocket control plane: gateway ↔ node daemon
- Task states: pending → running → completed | error | stopped
- Documented in `docs/design/communication.md`, `task-lifecycle.md`, `protocol.md`
- Event types: task:submit, task:started, task:completed, task:error, etc.

**Nanobot** uses a simple message bus:
- `InboundMessage` / `OutboundMessage` with channel, chat_id, content
- No formal task lifecycle; no multi-node concept

**Verdict:** OpenViber wins—protocol is explicit, documented, and supports multi-node orchestration.

---

### 3.4 Memory & Personalization

**OpenViber**:
- Three-file pattern: `soul.md`, `user.md`, `memory.md`
- Per-viber: `~/.openviber/vibers/{id}/soul.md`, `memory.md`
- Tiered memory: conversation, working memory (task.md), long-term (MEMORY.md), optional semantic index
- Documented in `docs/design/memory.md`, `personalization.md`

**Nanobot**:
- Bootstrap files: AGENTS.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md
- Memory: `MEMORY.md` + daily `memory/YYYY-MM-DD.md`
- Single workspace; no per-agent memory

**Verdict:** OpenViber wins—richer memory model, per-viber config, and clearer separation of user vs. soul vs. memory.

---

### 3.5 Skill System

**OpenViber**:
- `SkillRegistry` scans `SKILL.md` with frontmatter
- Lazy loading: `getTools(skillId)` for each skill
- Hub integration: external skill catalog (OpenClaw, GitHub, etc.)
- `SKILL.md` + `index.ts` per skill; `verify:skills` for validation

**Nanobot**:
- `SkillsLoader` with `get_always_skills()` and `build_skills_summary()`
- Skills are markdown files; agent uses `read_file` to load
- Simpler: no hub, no registry

**Verdict:** OpenViber wins—registry, discovery, hub, and verification; Nanobot is intentionally minimal.

---

### 3.6 Provider & Config

**OpenViber**:
- Provider abstraction: `getModelProvider()` from config
- Multi-provider support via config

**Nanobot**:
- `ProviderRegistry` (PROVIDERS list) + Pydantic schema
- Adding a provider: 2 steps (registry + schema field)
- Good docs in README for provider config

**Verdict:** Tie—both support multiple providers; Nanobot has a simpler provider registry, OpenViber has richer config.

---

### 3.7 Logging & Observability

**OpenViber**:
- Uses `console.log` in many places; `src/utils/logger.ts` exists but not consistently used
- Gateway has structured events (system, activity)

**Nanobot**:
- Uses `loguru` consistently
- Structured logging

**Verdict:** Nanobot wins—more consistent logging; OpenViber should improve.

---

### 3.8 Testing

**OpenViber**:
- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`
- E2E: `task-lifecycle.e2e.test.ts`
- `pnpm test`, `pnpm test:run` documented

**Nanobot**:
- pytest in `tests/`; optional dev dependency
- `core_agent_lines.sh` for line count

**Verdict:** OpenViber wins—broader test coverage and clearer test conventions.

---

### 3.9 Documentation

**OpenViber**:
- `docs/design/`: viber, communication, protocol, task-lifecycle, memory, personalization, error-handling, security, streaming, etc.
- `docs/concepts/`: jobs, skills, tools, viber
- `AGENTS.md`: AI agent instructions

**Nanobot**:
- README with setup, channel config, provider config
- COMMUNICATION.md, SECURITY.md
- No design docs

**Verdict:** OpenViber wins—comprehensive design documentation.

---

## 4. OpenViber Advantages Summary

1. **Architecture**: Stateless nodes, gateway, config-driven agents, multi-node orchestration
2. **Registry patterns**: Channels and skills are pluggable; no hardcoded lists
3. **Protocol**: Typed task lifecycle, documented events, WebSocket control plane
4. **Personalization**: Three-file pattern, per-viber config, tiered memory
5. **Skill system**: Registry, hub, discovery, verification
6. **Documentation**: Design docs in `docs/design/` cover architecture, protocol, memory
7. **Testing**: Unit, integration, E2E tests

---

## 5. Areas for Improvement in OpenViber

Based on the comparison, Nanobot does some things better. OpenViber should improve:

| Area | Current State | Improvement | Status |
|------|---------------|-------------|--------|
| **Logging** | `console.log` in many places | Use structured logger consistently (`src/utils/logger.ts`) across daemon, gateway, channels | ✅ In progress: channels, skills |
| **Channel registry** | Manager exists but channels are wired manually | Consider auto-discovery or plugin-style registration for channels | Future |
| **AGENTS.md vs core** | AGENTS.md mentioned `core/`, `storage/`, `data/`, `state/` | Align docs with actual `src/` layout | ✅ Done |
| **Provider registry** | Provider config in code | Consider a registry pattern similar to Nanobot's provider registry for easier addition of new providers | Future |

---

## 6. Conclusion

**OpenViber** has a more elegant and extensible architecture for a *platform*:
- Clear separation of daemon, gateway, and channels
- Config-driven agents and multi-viber support
- Documented protocol and task lifecycle
- Registry patterns for skills and channels
- Rich design documentation

**Nanobot** is intentionally minimal and excels at:
- Simplicity and research-readiness
- Consistent logging
- Small codebase (~4k lines core agent)
- Quick setup for personal use

For a production deployment platform with multi-node orchestration, enterprise channels, and extensibility, **OpenViber is the more elegant architecture**. For rapid prototyping or research, Nanobot's minimalism is attractive. OpenViber should adopt the improvements listed in Section 5—especially structured logging—to further strengthen its design.
