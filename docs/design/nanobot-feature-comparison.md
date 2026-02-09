# Feature Comparison: OpenViber vs Nanobot (HKUDS)

> Comparison date: 2026-02-08
> OpenViber version: 0.5.1
> Nanobot version: 0.1.3.post5 (HKUDS/nanobot — 13K+ stars)

## Executive Summary

Both OpenViber and nanobot are local-first AI agent frameworks that run on your machine, support scheduled tasks, memory/personalization, and enterprise messaging channels. They share a remarkably similar philosophy: privacy-first, outbound-only connections, and YAML/markdown-driven configuration.

However, nanobot has several features that OpenViber currently lacks, and vice versa. This document identifies the **gaps** where OpenViber could benefit from nanobot's approach.

---

## Feature Matrix

| Feature | OpenViber | nanobot (HKUDS) | Gap? |
|---------|:---------:|:---------------:|:----:|
| **Core Agent** | | | |
| Config-driven agents (YAML) | Yes | Yes (JSON) | — |
| Multi-step tool execution | Yes | Yes | — |
| Streaming responses | Yes (AI SDK) | Yes (LiteLLM) | — |
| System prompt assembly | Yes | Yes | — |
| Max iterations / step limit | Yes (maxSteps) | Yes (max_iterations) | — |
| **LLM Providers** | | | |
| OpenAI | Yes | Yes | — |
| Anthropic | Yes | Yes | — |
| DeepSeek | Yes | Yes | — |
| OpenRouter | Yes | Yes | — |
| Google Gemini | No | Yes | **GAP** |
| Groq (+ voice transcription) | No | Yes | **GAP** |
| Moonshot/Kimi | No | Yes | **GAP** |
| Zhipu GLM | No | Yes | **GAP** |
| DashScope (Qwen) | No | Yes | **GAP** |
| AiHubMix | No | Yes | **GAP** |
| vLLM (local models) | No | Yes | **GAP** |
| Provider auto-detection | No | Yes (keyword matching) | **GAP** |
| Easy provider registration | Manual code change | 2-step registry pattern | **GAP** |
| **Messaging Channels** | | | |
| DingTalk (钉钉) | Yes | No | OV advantage |
| WeCom (企业微信) | Yes | No | OV advantage |
| Telegram | No | Yes | **GAP** |
| Discord | No | Yes | **GAP** |
| WhatsApp | No | Yes | **GAP** |
| Feishu (飞书) | No | Yes (WebSocket) | **GAP** |
| Web UI chat | Yes (Viber Board) | No (CLI only) | OV advantage |
| Terminal chat (CLI) | Yes (`viber chat`) | Yes (`nanobot agent`) | — |
| Channel allow-list (security) | No | Yes (`allowFrom`) | **GAP** |
| **Built-in Tools** | | | |
| File read/write/edit/list | Yes | Yes | — |
| File move/copy/exists | Yes | No | OV advantage |
| Shell execution | No (via skills) | Yes (built-in `exec`) | **GAP** |
| Web search | Yes (Tavily/Serper) | Yes (Brave Search) | — |
| Web fetch/scrape | Yes (Firecrawl/Jina) | Yes (built-in) | — |
| Website crawling | Yes | No | OV advantage |
| Browser automation (CDP) | Yes | No | OV advantage |
| Desktop control | Yes | No | OV advantage |
| Notifications | Yes | No | OV advantage |
| Scheduling (tool) | Yes | Yes (Cron tool) | — |
| Message sending (tool) | No | Yes (`message` tool) | **GAP** |
| **Shell Execution** | | | |
| Built-in shell tool | No | Yes | **GAP** |
| Command deny patterns | No | Yes (dangerous cmd regex) | **GAP** |
| Workspace restriction | No | Yes (`restrictToWorkspace`) | **GAP** |
| Configurable timeout | No | Yes (per-command) | **GAP** |
| **Sub-Agents / Background Tasks** | | | |
| Spawn subagent (background) | No | Yes (`spawn` tool) | **GAP** |
| Subagent result announcement | No | Yes (callback to channel) | **GAP** |
| Parallel agent execution | Yes | No (serial spawn only) | OV advantage |
| Agent-to-agent messaging | Yes | No | OV advantage |
| Shared context between agents | Yes | No | OV advantage |
| Collaborative planning | Yes | No | OV advantage |
| **Skills System** | | | |
| SKILL.md definitions | Yes | Yes | — |
| Workspace-local skills | Yes | Yes | — |
| Built-in skills | Yes (github, tmux, codex-cli, cursor-agent, antigravity) | Yes (github, tmux, weather, cron, summarize, skill-creator) | — |
| Progressive skill loading | Yes (summary → full load) | Yes (summary → read_file) | — |
| Skills availability check | Yes | Yes (requirements) | — |
| Weather skill | No | Yes | **GAP** |
| Skill creator skill | No | Yes (auto-create skills) | **GAP** |
| Summarize skill | No | Yes | **GAP** |
| **Memory & Personalization** | | | |
| Three-file pattern (soul/user/memory) | Yes | Partial (AGENTS.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md) | — |
| Per-viber personalization | Yes (vibers/{id}/) | No (single workspace) | OV advantage |
| Daily memory logs | No (documented, not implemented) | Yes (memory/YYYY-MM-DD.md) | **GAP** |
| Long-term memory (MEMORY.md) | Yes (memory.md) | Yes (MEMORY.md) | — |
| Recent memories aggregation | No | Yes (last N days) | **GAP** |
| Memory append tool for agent | No | Yes (agent writes to memory) | **GAP** |
| Bootstrap file loading | Yes | Yes (AGENTS.md, SOUL.md, etc.) | — |
| TOOLS.md context file | No | Yes | **GAP** |
| IDENTITY.md context file | No | Yes (separate from soul) | **GAP** |
| **Scheduling / Cron** | | | |
| YAML cron jobs | Yes | No (CLI-based cron add) | OV advantage |
| Cron expression support | Yes (Croner) | Yes | — |
| Natural language scheduling | No | Yes (`--every 3600`) | **GAP** |
| CLI cron management | No | Yes (`nanobot cron add/list/remove`) | **GAP** |
| Agent-invoked scheduling | Yes (schedule tool) | Yes (cron tool) | — |
| Jobs directory (hot reload) | Yes | No | OV advantage |
| **Heartbeat / Proactive Agent** | | | |
| HEARTBEAT.md task file | No | Yes | **GAP** |
| Periodic agent wake-up | No | Yes (configurable interval) | **GAP** |
| Proactive task checking | No | Yes (reads HEARTBEAT.md) | **GAP** |
| **Session Management** | | | |
| Conversation persistence | Yes (Supabase DB) | Yes (JSONL files) | — |
| Per-channel sessions | Partial (per-task) | Yes (channel:chat_id keyed) | **GAP** |
| Session history limits | Yes (last 4 messages) | Yes (configurable max) | — |
| Session clear/reset | No | Yes | **GAP** |
| **Daemon / Architecture** | | | |
| Hub-node architecture | Yes (hub + nodes) | No (single process) | OV advantage |
| Outbound WebSocket to cloud | Yes | No | OV advantage |
| Auto-reconnection | Yes | N/A | OV advantage |
| Heartbeat monitoring | Yes | N/A | OV advantage |
| Terminal streaming (tmux) | Yes | No | OV advantage |
| Multi-node coordination | Yes | No | OV advantage |
| Gateway mode | No | Yes (`nanobot gateway`) | **GAP** |
| **MCP Integration** | | | |
| MCP client support | Yes (documented) | No | OV advantage |
| MCP server configuration | Yes (YAML) | No | OV advantage |
| Tool namespacing | Yes | No | OV advantage |
| Approval gates for MCP tools | Yes | No | OV advantage |
| **Web UI** | | | |
| Viber Board (SvelteKit) | Yes | No | OV advantage |
| Chat interface | Yes | No | OV advantage |
| Terminal panel | Yes | No | OV advantage |
| Job management UI | Yes | No | OV advantage |
| Node management UI | Yes | No | OV advantage |
| Environment management | Yes | No | OV advantage |
| **Security** | | | |
| Working mode (always_ask / agent_decides / always_execute) | Yes | No | OV advantage |
| Tool approval gates | Yes | No | OV advantage |
| Workspace sandboxing | No | Yes (`restrictToWorkspace`) | **GAP** |
| Shell command deny list | No | Yes (regex patterns) | **GAP** |
| Channel user allowlist | No | Yes (`allowFrom`) | **GAP** |
| **Deployment** | | | |
| npm/npx install | Yes (`npx openviber start`) | Yes (`pip install nanobot-ai`) | — |
| Docker support | No | Yes | **GAP** |
| Onboarding command | No | Yes (`nanobot onboard`) | **GAP** |
| Status command | No | Yes (`nanobot status`) | **GAP** |
| **Observability** | | | |
| Helicone integration | Yes | No | OV advantage |
| Structured logging | Partial (console.log) | Yes (loguru) | **GAP** |
| Usage tracking per user | Yes | No | OV advantage |

---

## Key Gaps to Address (Priority Order)

### P0 — Critical Missing Features

1. **Shell Execution Tool**
   - nanobot has a built-in `exec` tool with security features (deny patterns, workspace restriction, configurable timeout)
   - OpenViber relies on skills (codex-cli, cursor-agent) for code execution but has no direct shell tool
   - **Impact**: Agents cannot run arbitrary shell commands, limiting coding workflows

2. **More LLM Providers**
   - nanobot supports 11 providers (OpenAI, Anthropic, DeepSeek, OpenRouter, Gemini, Groq, Moonshot, Zhipu, DashScope, AiHubMix, vLLM)
   - OpenViber only supports 4 (OpenAI, Anthropic, DeepSeek, OpenRouter)
   - **Missing**: Gemini, Groq, local models (vLLM), and Chinese providers (DashScope/Qwen, Moonshot/Kimi, Zhipu)
   - **Impact**: Limits user choice, especially for users wanting local model support or Chinese LLM providers

3. **Provider Registry Pattern**
   - nanobot uses a registry pattern where adding a new provider takes only 2 steps (add spec + config field)
   - OpenViber requires modifying `provider.ts` switch statement
   - **Impact**: Makes it harder to contribute new providers

### P1 — Important Features

4. **Subagent Spawning (Background Tasks)**
   - nanobot can spawn background subagents via a `spawn` tool — the agent decides to delegate complex tasks
   - OpenViber has parallel execution but no agent-initiated background task spawning
   - **Impact**: Limits agent autonomy for complex multi-step tasks

5. **Consumer Messaging Channels**
   - nanobot supports Telegram, Discord, WhatsApp, and Feishu (飞书)
   - OpenViber supports DingTalk and WeCom (enterprise focus)
   - **Missing**: Telegram (most popular for bots), Discord, WhatsApp, Feishu
   - **Impact**: Limits reach to consumer/community use cases

6. **Heartbeat / Proactive Agent**
   - nanobot's HEARTBEAT.md system periodically wakes the agent to check for pending tasks
   - OpenViber has cron jobs but no file-based proactive task checking
   - **Impact**: Users can't drop tasks in a file for the agent to pick up asynchronously

7. **Daily Memory Logs**
   - nanobot auto-creates `memory/YYYY-MM-DD.md` files and can aggregate recent memories
   - OpenViber documents this pattern but hasn't implemented auto daily logging
   - **Impact**: Agent memory doesn't grow organically from daily interactions

8. **Workspace Sandboxing & Shell Security**
   - nanobot has `restrictToWorkspace` flag and regex-based deny patterns for dangerous commands
   - OpenViber has working modes but no filesystem/shell sandboxing
   - **Impact**: Security risk when agents operate on the local filesystem

### P2 — Nice to Have

9. **Docker Support**
    - nanobot provides a Dockerfile and documented Docker workflow
    - OpenViber has no Docker support
    - **Impact**: Harder to deploy in containerized environments

10. **Onboarding & Status Commands**
    - `nanobot onboard` initializes workspace and config
    - `nanobot status` shows provider status, connected channels, etc.
    - **Impact**: First-run experience and diagnostics

11. **Gateway Mode**
    - nanobot has a `gateway` command that starts all channels and the agent loop
    - OpenViber separates hub and node, which is more flexible but more complex
    - **Impact**: Simpler single-command deployment for channel-based bots

12. **Structured Logging**
    - nanobot uses loguru for structured logging
    - OpenViber uses console.log/console.error throughout
    - **Impact**: Harder to debug and monitor in production

13. **Voice Transcription**
    - nanobot supports Groq Whisper for Telegram voice message transcription
    - OpenViber has no voice input support
    - **Impact**: Limits multimedia interaction

14. **Message Tool**
    - nanobot agents can proactively send messages to users via a `message` tool
    - OpenViber agents respond in the streaming flow but can't initiate messages
    - **Impact**: Agents can't proactively communicate results to other channels

15. **Channel User Allowlist**
    - nanobot supports `allowFrom` per channel to restrict who can interact
    - OpenViber has no per-channel access control
    - **Impact**: Security gap for public-facing channel bots

---

## OpenViber's Advantages Over Nanobot

These are features where OpenViber is ahead:

1. **Hub-Node Architecture** — Multi-node coordination, terminal streaming, centralized management
2. **Web UI (Viber Board)** — Full SvelteKit dashboard with chat, terminals, jobs, node management
3. **MCP Integration** — Full MCP client with tool namespacing, approval gates, resource access
4. **Multi-Agent Collaboration** — Parallel execution engine, agent-to-agent messaging, shared context
5. **Collaborative Planning** — LLM-driven plan generation and adaptation
6. **Plan & Task Lifecycle** — Structured task management with status tracking
7. **Artifact Management** — Space-scoped artifact storage and context injection
8. **Browser Automation** — CDP-based browser and desktop control tools
9. **Working Modes** — Three-tier approval system (always_ask / agent_decides / always_execute)
10. **Helicone Observability** — Built-in usage tracking and LLM observability
11. **YAML Cron Jobs** — File-based job definitions with hot reload
12. **Enterprise Channels** — DingTalk and WeCom integration
13. **Supabase Database** — Cloud-ready data persistence
14. **AI SDK Integration** — Leverages Vercel AI SDK for consistent LLM interface

---

## Recommendations

### Quick Wins (Low effort, high impact)

1. **Add a shell execution tool** — Port nanobot's `exec` tool pattern with deny-list security
2. **Add `restrictToWorkspace` flag** — Sandbox file and shell operations to workspace directory
3. **Add `viber status` CLI command** — Show provider config, connected channels, running tasks
4. **Add channel `allowFrom` config** — Per-channel user allowlist for DingTalk/WeCom

### Medium-Term (Moderate effort)

5. **Provider registry pattern** — Replace switch statement with extensible registry
6. **Add Gemini and Groq providers** — Two most requested missing providers
7. **Add vLLM / local model support** — OpenAI-compatible API adapter for local inference
8. **Implement daily memory logs** — Auto-create `memory/YYYY-MM-DD.md` on each interaction
9. **Add Docker support** — Dockerfile and docker-compose for containerized deployment
10. **Add `viber onboard` command** — Interactive setup wizard for first-time users

### Longer-Term (Larger effort)

11. **Add Telegram channel** — Most popular bot platform, largest potential user base
12. **Add Discord channel** — Strong developer community presence
13. **Add spawn/subagent tool** — Let agents delegate background tasks to sub-agents
14. **Add heartbeat system** — HEARTBEAT.md file-based proactive task checking
15. **Add WhatsApp channel** — Consumer messaging reach
16. **Add Feishu channel** — Chinese enterprise market (WebSocket, no public IP needed)

---

## Also Compare: nanobot-ai/nanobot (MCP Agent Builder)

A separate project, [nanobot-ai/nanobot](https://github.com/nanobot-ai/nanobot) (897 stars), is a Go-based standalone MCP host for building chatbot agents. Key differences:

| Feature | OpenViber | nanobot-ai |
|---------|:---------:|:----------:|
| Language | TypeScript | Go |
| Focus | Local agent runtime | MCP host / chatbot builder |
| MCP role | Client (connects to servers) | Host (IS the MCP host) |
| Multi-agent | Yes (parallel, collaboration) | Yes (agent definitions) |
| Agent config | YAML | YAML or directory-based (.md files) |
| Directory-based agents | No | Yes (agents/*.md with frontmatter) |
| Built-in web UI | Yes (Viber Board) | Yes (port 8080) |
| Standalone deployment | Daemon | Standalone binary |
| MCP-UI support | No | Yes (partial) |

**Notable pattern from nanobot-ai**: Directory-based agent configuration where each agent is a `.md` file with YAML frontmatter. This is an elegant pattern that OpenViber could adopt for its viber definitions.

---

*This comparison was generated by analyzing the source code of both projects. Feature availability is based on code inspection, not marketing claims.*
