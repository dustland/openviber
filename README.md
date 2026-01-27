<div align="center">

<img src="https://raw.githubusercontent.com/dustland/viber/main/docs/src/assets/logo.png" alt="Viber Logo" width="120" />

# Viber

### The Open Source Cowork Desktop for Your AI Workforce

<!-- SHIELD GROUP -->

[![Download][download-shield]][viber-npm]
[![GitHub Stars][github-star]][viber-github]
[![npm version][npm-shield]][viber-npm]
[![License][license-shield]][license-link]

**English** · [简体中文](./README_CN.md) · [Documentation][docs-site] · [Feedback][github-issues]

</div>

---

**Viber** is an open-source Cowork Desktop that runs a team of AI agents on your machine. Unlike cloud-based agent frameworks, Viber runs locally with full privacy, connects outbound to your enterprise channels, and automates real work while you sleep.

### ⭐ 100% Open Source · 🥇 Local Deployment · 🏆 MCP Integration

- ✅ **Zero Setup** — No servers to host, just `npx @dustland/viber start`
- ✅ **Multi-Agent Workforce** — Specialized agents working in parallel  
- ✅ **Human-in-the-Loop** — Enterprise messaging channels (DingTalk, WeCom)
- ✅ **Privacy First** — 100% local execution, data never leaves your machine

---

## 🚀 Quick Start

```bash
npx @dustland/viber start
```

## ✨ Features

### 🤖 Multi-Agent Workforce

Deploy specialized agents that work in parallel via simple YAML configuration:

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
- **Progressive Autonomy** — Start supervised, gradually increase agent freedom
- **Context Handoff** — Seamlessly transfer context between human and agent

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
viber start --channel dingtalk --token YOUR_TOKEN
viber start --channel wecom --corpid YOUR_CORP
```

---

## 📚 Examples

### 🩹 Antigravity — Self-Healing for AI Coding Tools

A built-in skill example that monitors and recovers AI coding tools:

```yaml
# examples/jobs/antigravity-healer.yaml
name: antigravity-healer
schedule: "*/3 * * * * *"  # every 3 seconds
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
│              Viber Cowork Desktop               │
│                                                 │
│  ┌──────────┐  ┌────────┐  ┌────────────────┐   │
│  │ViberAgent│──│ Agents │──│     Tools      │   │
│  │ (Leader) │  │(Workers)│  │(Browser/File)  │   │
│  └──────────┘  └────────┘  └────────────────┘   │
│        │                                        │
│   ┌────┴─────────────────────┐                  │
│   │         Scheduler        │                  │
│   │    (YAML Cron Jobs)      │                  │
│   └──────────────────────────┘                  │
│        │                                        │
│   ┌────┴─────────────────────┐                  │
│   │        Channels          │                  │
│   │  DingTalk | WeCom | Web  │                  │
│   └──────────────────────────┘                  │
└─────────────────────────────────────────────────┘
          ↓                    ↓
    Outbound Only      Local Execution
```

## 📦 Three Pillars

| Component | What | Where |
|-----------|------|-------|
| **Jobs** | Scheduled tasks (YAML cron) | `examples/jobs/` |
| **Skills** | Capabilities (SKILL.md) | `skills/` |
| **Tools** | Low-level primitives | `src/tools/` |

## 📊 Comparison

| | Viber | Cloud Agents | IDE Plugins |
|---|:---:|:---:|:---:|
| Deployment | Local app | Cloud server | Editor only |
| Connection | Outbound | Inbound | None |
| Jobs | YAML cron | Complex code | Manual |
| Privacy | 100% local | Data leaves | Varies |
| Channels | DingTalk/WeCom | WhatsApp/Telegram | None |

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
[viber-github]: https://github.com/dustland/viber
[viber-npm]: https://www.npmjs.com/package/@dustland/viber
[docs-site]: https://viber.dustland.ai/docs
[github-issues]: https://github.com/dustland/viber/issues
[license-link]: https://github.com/dustland/viber/blob/main/LICENSE

<!-- SHIELDS -->
[download-shield]: https://img.shields.io/badge/Download-Viber-blue?style=flat-square
[github-star]: https://img.shields.io/github/stars/dustland/viber?style=flat-square&logo=github
[npm-shield]: https://img.shields.io/npm/v/@dustland/viber?style=flat-square&logo=npm
[license-shield]: https://img.shields.io/badge/License-Apache%202.0-green?style=flat-square
