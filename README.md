<div align="center">

<img src="https://raw.githubusercontent.com/dustland/openviber/main/web/static/favicon.png" alt="Viber Logo" width="120" />

# OpenViber

### You Imagine It. Vibers Build It.

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

The fastest way to get started is using `npx`:

```bash
# 1. Set your API key (OpenRouter recommended)
export OPENROUTER_API_KEY="your_api_key_here"

# 2. Start OpenViber
npx openviber start
```

If you prefer to install it globally:
```bash
npm install -g openviber
viber start
```

---

## 🛠️ Development Setup

If you want to contribute or run from source:

### 1. Prerequisites
- **Node.js** v18+ and **pnpm** (recommended)
- **tmux** installed (`brew install tmux` on macOS)

### 2. Installation
```bash
git clone https://github.com/dustland/openviber.git
cd openviber
pnpm install

# Configure environment
cp .env.example .env
# Add your OPENROUTER_API_KEY to .env
```

### 3. Launch full stack
```bash
# Starts Hub, Viber Node, and Web UI
pnpm dev
```
- **Viber Board (Web UI)**: [http://localhost:6006](http://localhost:6006)
- **Viber Hub**: [http://localhost:6007](http://localhost:6007)

- **Viber Board (Web UI)**: [http://localhost:6006](http://localhost:6006)
- **Viber Hub**: [http://localhost:6007](http://localhost:6007)

---

## 🧵 Interactive Experience

OpenViber provides multiple ways to interact with your vibers, designed for both developers and teams.

### 💻 Terminal Chat (tmux-friendly)
Use OpenViber from any terminal. It integrates deeply with tmux for streaming output and managing long-running tasks.

```bash
# Start an interactive chat
viber chat
```

### 🌐 Viber Board (Web UI)
A modern, visual interface to manage your viber nodes, monitor jobs, and chat in real-time. Accessible at `http://localhost:6006` when running `pnpm dev`.

### 🏢 Enterprise Channels
Deploy your vibers to where your team works. Support for **DingTalk** and **WeCom** is built-in.

```bash
# Start the enterprise gateway
viber gateway
```

---

## 🧠 Personalization (The Three-File Pattern)

OpenViber follows a standardized configuration pattern for AI personality. Three markdown files define your viber's complete behavior:

| File | Scope | Purpose | Update Frequency |
|------|-------|---------|------------------|
| **`user.md`** | Shared | Who you are, current projects, priorities | Daily/Weekly |
| **`soul.md`** | Per-viber | Communication style, boundaries, rules | Monthly |
| **`memory.md`** | Per-viber | Decisions, learned patterns, corrections | Grows organically |

Location: `~/.openviber/vibers/default/`

---

## ✨ Key Features

### 🤖 Viber Workforce (Jobs)
Deploy autonomous workers via simple YAML cron jobs.
```yaml
# examples/jobs/morning-standup.yaml
name: morning-standup
schedule: "0 9 * * 1-5" # Every weekday at 9 AM
prompt: "Check GitHub notifications, summarize what needs my attention."
```

### 🔧 Zero Configuration Skills
Capabilities are defined in `SKILL.md` files. No complex code required to extend your viber.
```markdown
---
name: git-commit
description: Stage and commit changes
---
git add . && git commit -m "$message"
```

### 🌐 Model Context Protocol (MCP)
Seamlessly connect to any MCP server to give your vibers access to external tools like Google Maps, Slack, or custom internal APIs.

### 👤 Human-in-the-Loop
Maintain control with approval gates. Vibers can be configured to pause and ask for permission before executing sensitive actions (e.g., deleting files, making payments).

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

## 📊 Comparison

| Feature | OpenViber | Cloud Agents | IDE Plugins |
| :--- | :---: | :---: | :---: |
| **Deployment** | Local Node | Cloud Server | Editor Only |
| **Connectivity** | Outbound | Inbound/Cloud | None |
| **Autonomy** | Full (Jobs/Cron) | Managed | Manual Trigger |
| **Privacy** | 100% Local | Data Leaves | Limited |
| **Channels** | Multi-channel | Web only | Chat only |

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## Thanks

Special thanks to the maintainers and contributors of [awesome-openclaw-skills][awesome-openclaw-skills] for curating a high-quality OpenClaw skill catalog that helps power skill discovery in OpenViber.

## 📄 License

Licensed under the [Apache License 2.0](./LICENSE).

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
[awesome-openclaw-skills]: https://github.com/VoltAgent/awesome-openclaw-skills

<!-- SHIELDS -->
[download-shield]: https://img.shields.io/badge/Download-Viber-blue?style=flat-square
[github-star]: https://img.shields.io/github/stars/dustland/openviber?style=flat-square&logo=github
[npm-shield]: https://img.shields.io/npm/v/openviber?style=flat-square&logo=npm
[license-shield]: https://img.shields.io/badge/License-Apache%202.0-green?style=flat-square