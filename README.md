<div align="center">

<img src="https://raw.githubusercontent.com/dustland/openviber/main/web/static/favicon.png" alt="Viber Logo" width="120" />

# OpenViber

### You Imagine It. Vibers Build It.

<!-- SHIELD GROUP -->

[![Download][download-shield]][viber-npm]
[![GitHub Stars][github-star]][viber-github]
[![npm version][npm-shield]][viber-npm]
[![License][license-shield]][license-link]

**English** · [简体中文](./README_CN.md) · [Documentation][docs-site] · [Feedback][github-issues]

</div>

---

**OpenViber** is an open-source platform that turns your machine into a **Viber Node** — hosting role-scoped AI workers called **vibers** that automate real work. Unlike cloud-based agent frameworks, OpenViber runs locally with full privacy, connects outbound to your enterprise channels, and works autonomously while you sleep.

### ⭐ 100% Open Source · 🥇 Local Deployment · 🏆 MCP Integration

- ✅ **Zero Setup** — No servers to host, just `npx openviber start`
- ✅ **Viber Workforce** — Role-scoped vibers working in parallel
- ✅ **Human-in-the-Loop** — Enterprise messaging channels (DingTalk, WeCom)
- ✅ **Privacy First** — 100% local execution, data never leaves your machine

---

## 🚀 Quick Start

```bash
npx openviber start
```

If you install the package (global or in-project), the CLI is available as both `openviber` and the shorter alias `viber`.

## 🧵 Terminal Chat (tmux-friendly)

Use OpenViber from any terminal (including inside tmux) via the local hub.

```bash
# 1) Start the hub
openviber hub

# 2) Start the viber node (connects to the hub)
openviber start

# 3) Chat from your terminal
openviber chat

# Optional: list/attach to tmux panes via the local WS server (:6008)
openviber term list
openviber term attach <session:window.pane>
```

## 🧠 Personalization (The Three-File Pattern)

OpenViber follows the same configuration pattern that has emerged across serious AI platforms (Claude Projects, Custom GPTs, Cursor Rules). Three markdown files define your viber's complete behavior:

```
~/.openviber/
├── user.md                    # Who you are (shared across vibers)
└── vibers/default/
    ├── soul.md                # How this viber thinks and communicates
    └── memory.md              # What this viber remembers over time
```

| File | Scope | Purpose | Update Frequency |
|------|-------|---------|------------------|
| **user.md** | Shared | Current projects, priorities, preferences | Daily/Weekly |
| **soul.md** | Per-viber | Communication style, boundaries, operational rules | Monthly |
| **memory.md** | Per-viber | Decisions, learned patterns, corrections | Grows organically |

These files work as a system — a detailed personality is useless without user context, and memory without personality produces generic responses. The power comes from alignment between all three.

**The skill transfers**: Time invested in configuring these files isn't locked into OpenViber. The pattern is identical across agent platforms, so your configuration travels with you.

See [Personalization Architecture](./docs/design/personalization.md) for setup instructions.

## ✨ Features

### 🤖 Viber Workforce

Deploy role-scoped vibers that work in parallel via simple YAML configuration:

```yaml
# examples/jobs/morning-standup.yaml
name: morning-standup
schedule: "0 9 * * 1-5"
prompt: "Check my GitHub notifications and Slack mentions, summarize what needs my attention"
model: anthropic/claude-sonnet-4-20250514
```

### 🔧 Zero Configuration Skills

Capabilities defined in `SKILL.md` files — no code required:

```markdown
---
name: git-commit
description: Stage and commit changes
---

git add . && git commit -m "$message"
```

### 🌐 MCP Integration

Connect to any Model Context Protocol server for extended capabilities:

```yaml
mcp_servers:
  - name: github
    command: npx -y @modelcontextprotocol/server-github
```

### 👤 Human-in-the-Loop

Critical for long-running vibe-working tasks like vibe-coding:

- **Approval Gates** — Pause for human review before critical actions
- **Interactive Channels** — Real-time collaboration via DingTalk/WeCom
- **Progressive Autonomy** — Start supervised, gradually increase viber freedom
- **Context Handoff** — Seamlessly transfer context between human and viber

```yaml
# Example: Require approval for deployments
approval_required:
  - deploy
  - delete
  - billing
```

### 💬 Enterprise Channels

Native integrations for DingTalk (钉钉) and WeCom (企业微信):

```bash
openviber start --channel dingtalk --token YOUR_TOKEN
openviber start --channel wecom --corpid YOUR_CORP
```

---

## 📚 Examples

### 🩹 Antigravity — Self-Healing for AI Coding Tools

A built-in skill example that monitors and recovers AI coding tools:

```yaml
# examples/jobs/antigravity-healer.yaml
name: antigravity-healer
schedule: "*/3 * * * * *" # every 3 seconds
skill: antigravity
prompt: "Check Antigravity IDE status and auto-recover if errors found"
```

- **Monitors** all IDE windows for agent crashes
- **Auto-recovers** by clicking Retry across multiple windows
- **Keeps** your flow uninterrupted

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                  Viber Node                     │
│                                                 │
│  ┌────────────────────────────────────────────┐  │
│  │  dev-viber │ researcher-viber │ pm-viber   │  │
│  └────────────────────────────────────────────┘  │
│        │                                        │
│   ┌────┴─────────────────────┐                  │
│   │  Scheduler + Dispatcher  │                  │
│   │    (YAML Cron Jobs)      │                  │
│   └──────────────────────────┘                  │
│        │                                        │
│   ┌────┴─────────────────────┐                  │
│   │     Tools + Skills       │                  │
│   │  (Browser/File/MCP/CLI)  │                  │
│   └──────────────────────────┘                  │
│        │                                        │
│   ┌────┴─────────────────────┐                  │
│   │        Channels          │                  │
│   │  Board │ DingTalk │ CLI  │                  │
│   └──────────────────────────┘                  │
└─────────────────────────────────────────────────┘
          ↓                    ↓
    Outbound Only      Local Execution
```

## 📦 Three Pillars

| Component  | What                        | Where            |
| ---------- | --------------------------- | ---------------- |
| **Jobs**   | Scheduled tasks (YAML cron) | `examples/jobs/` |
| **Skills** | Capabilities (SKILL.md)     | `skills/`        |
| **Tools**  | Low-level primitives        | `src/tools/`     |

## 📊 Comparison

|            |     Viber      |   Cloud Agents    | IDE Plugins |
| ---------- | :------------: | :---------------: | :---------: |
| Deployment |   Local app    |   Cloud server    | Editor only |
| Connection |    Outbound    |      Inbound      |    None     |
| Jobs       |   YAML cron    |   Complex code    |   Manual    |
| Privacy    |   100% local   |    Data leaves    |   Varies    |
| Channels   | DingTalk/WeCom | WhatsApp/Telegram |    None     |

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the [Apache License 2.0](./LICENSE).

```
Copyright 2024-2026 Dustland

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

### 🙏 Acknowledgments

Viber is built on the shoulders of amazing open-source projects:

- [Vercel AI SDK](https://sdk.vercel.ai) — Unified LLM interface
- [Model Context Protocol](https://modelcontextprotocol.io) — Standardized tool integration
- [Croner](https://github.com/hexagon/croner) — Lightweight cron scheduling
- [Zod](https://zod.dev) — TypeScript-first schema validation

---

<div align="center">

**[Website][viber-site]** · **[Documentation][docs-site]** · **[Issues][github-issues]**

Made with ❤️ by [Dustland](https://dustland.ai)

If you find Viber helpful, please ⭐ star us on GitHub!

</div>

<!-- LINKS -->

[viber-site]: https://viber.dustland.ai
[viber-github]: https://github.com/dustland/openviber
[viber-npm]: https://www.npmjs.com/package/openviber
[docs-site]: https://viber.dustland.ai/docs
[github-issues]: https://github.com/dustland/openviber/issues
[license-link]: https://github.com/dustland/openviber/blob/main/LICENSE

<!-- SHIELDS -->

[download-shield]: https://img.shields.io/badge/Download-Viber-blue?style=flat-square
[github-star]: https://img.shields.io/github/stars/dustland/openviber?style=flat-square&logo=github
[npm-shield]: https://img.shields.io/npm/v/openviber?style=flat-square&logo=npm
[license-shield]: https://img.shields.io/badge/License-Apache%202.0-green?style=flat-square
