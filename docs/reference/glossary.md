---
title: "Glossary"
---
A comprehensive reference for OpenViber terminology and concepts.


## A

### Artifact

A living document within a Space that evolves over time. Artifacts can be:

- Documents (Markdown, text, HTML)
- Code files
- Data files (JSON, CSV)
- Binary files (images, PDFs)

Each artifact maintains version history, allowing you to track changes and rollback if needed.

### Adapter

A storage backend implementation. OpenViber supports:

- **Local Adapter**: SQLite + Filesystem (default)
- **Supabase Adapter**: PostgreSQL + Supabase Storage (cloud)

## C

### Context

The accumulated information that vibers use to understand and respond to requests. Context includes:

- Conversation history
- Artifact contents
- Space goal and metadata
- Previous decisions

### Conversation History

The complete record of messages between users and vibers within a Space. History persists across sessions, enabling vibers to maintain continuity.

## D

### Daemon (Node Runtime)

The local process running on a Viber Node that executes tasks and connects outbound to the
Gateway. In docs, "daemon" and "node runtime" are used interchangeably.

## G

### Gateway

The central coordinator that routes messages between node runtimes (daemons) and the web app.
Started via `viber gateway`. Nodes connect outbound to the gateway via WebSocket; the web app
(Viber Board) talks to the gateway via REST and SSE. This is distinct from the **Channels**
server (enterprise channel webhooks) and from the **Skill Hub** (external skill registry).

## H

### History

See [Conversation History](#conversation-history).

### Hub (Skill Hub)

The external skill registry for discovering and importing skills from sources like OpenClaw,
GitHub, npm, and others. See `src/skills/hub/` for the implementation. Not to be confused with
the Gateway (central coordinator).

### Channels (enterprise channel server)

The HTTP server that receives webhooks from enterprise channels (DingTalk, WeCom, Discord,
Feishu). Started via `viber channels`. Implemented by `ChannelGateway` in `src/channels/gateway.ts`.
Distinct from the Gateway (central coordinator for vibers).

## J

### Job

A scheduled task defined as a YAML file that runs automatically on a cron timer. Jobs specify a schedule, a prompt, and optional configuration (model, skills, tools). They are stored per-viber in `~/.openviber/vibers/{id}/jobs/` or globally in `~/.openviber/jobs/`.

When a job fires, the `JobScheduler` creates an `Agent` with the job's configuration and executes the prompt. Jobs can leverage skills for domain knowledge — for example, a health-check job uses the `antigravity` skill.

See [Jobs](/docs/concepts/jobs) for full documentation.

### Job Scheduler

The `JobScheduler` class that manages cron-based job execution. It reads YAML job files from disk, registers cron triggers via Croner, and creates Agent instances to execute job prompts on schedule.

## M

### Message

A single unit of communication within a conversation. Messages have:

- **role**: `user`, `assistant`, or `system`
- **content**: The message text
- **metadata**: Additional information (timestamps, viber info)

### Metadata

Additional information attached to messages, Spaces, or artifacts. Used for tracking, filtering, and coordination.

### Mode

The operational mode for viber interactions:

- **Always Ask**: Viber asks before each action
- **Viber Decides**: Viber acts within policy boundaries
- **Always Execute**: Maximum autonomy, minimal interruption

## P

### Persistence

OpenViber's core capability of saving and restoring workspace state. Persistence enables:

- Session continuity across restarts
- Multi-day workflows
- Collaboration across time

### Provider

An LLM service provider. Supported providers:

- **OpenAI**: GPT-4, GPT-4o, GPT-4o-mini
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus
- **DeepSeek**: DeepSeek Chat, DeepSeek Coder
- **Google**: Gemini 1.5 Pro, Gemini 1.5 Flash
- **OpenRouter**: Access to multiple providers through a single API

## S

### Skill

A reusable bundle of domain knowledge that teaches a viber how to approach specific tasks. A skill is a directory containing a `SKILL.md` file (frontmatter + instructions) and optionally an `index.ts` that exports specialized tools.

Skills are discovered from:
- `~/.openviber/skills/` (user-defined)
- `src/skills/` (built-in: antigravity, cursor-agent, codex-cli, github, tmux)

Unlike tools (which provide actions), skills provide *knowledge and context* that gets injected into the agent's system prompt. Skills can also bundle their own tools — for example, the `github` skill provides `gh_list_issues`, `gh_create_pr`, etc.

See [Skills](/docs/concepts/skills) for full documentation.

### Skill Registry

The `SkillRegistry` class that manages skill discovery, loading, and tool registration. It scans skill directories for `SKILL.md` files, parses metadata, and lazily loads tools from `index.ts`.

### Space

A working directory that vibers operate in. Spaces live at `~/openviber_spaces/` by default, but vibers can be pointed at any directory (e.g., an existing Git repo). A Space can be:

- A cloned Git repository (code projects)
- A research folder (non-code work)
- An output directory (reports, generated content)

Multiple vibers can work on the same Space.

## T

### Tool

A capability that extends what vibers can do. Tools allow vibers to:

- Fetch external data
- Read/write files
- Search the web
- Execute code
- Interact with APIs

## V

### Viber

A role-scoped AI worker that runs on a Viber Node. Each viber has its own:

- **Persona** — Name, personality, communication style
- **Goals** — What it's designed to accomplish
- **Tools** — What actions it can take
- **Skills** — Domain knowledge it applies
- **Model** — Which LLM provider it uses

Vibers are configured through YAML files in `~/.openviber/vibers/`.

### Viber Node

A machine running the OpenViber runtime that hosts one or more vibers. A Viber Node provides:

- **Runtime** — The node runtime (daemon) process that executes viber tasks and connects to the Gateway
- **Scheduler** — Cron-based job scheduling for automated tasks
- **Credentials** — Shared account access for hosted vibers
- **Config** — Identity and viber settings at `~/.openviber/` (lightweight, portable)
- **Spaces** — Working data at `~/openviber_spaces/` (repos, research, outputs)

Nodes connect to the OpenViber Board via a one-time token command (`npx openviber connect --token ...`). Multiple vibers on one node coordinate through external systems (GitHub, email) rather than direct inter-viber messaging.

### ViberAgent

The core class that orchestrates a viber's task execution. ViberAgent:

- Processes user requests through an LLM
- Coordinates tool calls and skill loading
- Maintains context across sessions
- Reports progress and results

---

## Quick Reference

### Core Concepts

| Concept | Definition |
|---------|-----------|
| **Viber** | A role-scoped AI worker with persona, goals, tools, and skills |
| **Viber Node** | A machine running OpenViber, hosting one or more vibers |
| **Space** | A persistent workspace container for a viber's work |
| **Skill** | Domain knowledge bundle (`SKILL.md` + optional tools) that teaches agents domain-specific approaches |
| **Tool** | An action capability (file ops, terminal, browser, search) |
| **Job** | A YAML-defined scheduled task that runs on a cron timer |

### Common Patterns

| Pattern | Description |
|---------|-------------|
| **Single Viber** | One viber per node for general-purpose use |
| **Multi-Viber Team** | Multiple role-scoped vibers on one node coordinating via GitHub |
| **Scheduled Jobs** | Cron-triggered tasks using skills for automated workflows (health checks, daily summaries) |
| **Skill Chains** | Combining skills (e.g., github + codex-cli) for end-to-end autonomous workflows |
| **Chat-Created Jobs** | Creating scheduled jobs via natural language in the Viber Board |
