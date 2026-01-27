<div align="center">

<img src="https://raw.githubusercontent.com/dustland/viber/main/docs/src/assets/logo.png" alt="Viber Logo" width="120" />

# Viber

### 开源协作桌面 — 您的 AI 工作团队

<!-- SHIELD GROUP -->

[![Download][download-shield]][viber-npm]
[![GitHub Stars][github-star]][viber-github]
[![npm version][npm-shield]][viber-npm]
[![License][license-shield]][license-link]

[English](./README.md) · **简体中文** · [文档][docs-site] · [反馈][github-issues]

</div>

---

**Viber** 是一个开源协作桌面应用，在您的本地机器上运行 AI 智能体团队。与云端代理框架不同，Viber 在本地运行，保障完全隐私，通过出站连接对接企业通讯渠道，让您的工作在睡眠时也能自动化进行。

### ⭐ 100% 开源 · 🥇 本地部署 · 🏆 MCP 集成

- ✅ **零配置** — 无需托管服务器，只需运行 `npx @dustland/viber start`
- ✅ **多智能体协作** — 专业化智能体并行工作
- ✅ **人机协同** — 企业消息渠道（钉钉、企业微信）
- ✅ **隐私优先** — 100% 本地执行，数据永不离开您的机器

---

## 🚀 快速开始

```bash
npx @dustland/viber start
```

## ✨ 核心功能

### 🤖 多智能体工作团队

通过简单的 YAML 配置部署专业化智能体并行工作：

```yaml
# examples/jobs/morning-standup.yaml
name: morning-standup
schedule: "0 9 * * 1-5"
prompt: "检查我的 GitHub 通知和 Slack 消息，总结今天需要我关注的事项"
model: anthropic/claude-sonnet-4-20250514
```

### 🔧 零代码技能配置

通过 `SKILL.md` 文件定义能力 — 无需编写代码：

```markdown
---
name: git-commit
description: 暂存并提交更改
---
git add . && git commit -m "$message"
```

### 🌐 MCP 集成

连接任何 Model Context Protocol 服务器扩展能力：

```yaml
mcp_servers:
  - name: github
    command: npx -y @modelcontextprotocol/server-github
```

### 👤 人机协同 (Human-in-the-Loop)

对于长时间运行的 vibe-working 任务（如 vibe-coding）至关重要：

- **审批门控** — 在关键操作前暂停等待人工审核
- **交互渠道** — 通过钉钉/企业微信实时协作
- **渐进式自主** — 从监督开始，逐步增加智能体自主权
- **上下文交接** — 人机之间无缝传递上下文

```yaml
# 示例：部署操作需要审批
approval_required:
  - deploy
  - delete
  - billing
```

### 💬 企业通讯渠道

原生支持钉钉和企业微信：

```bash
viber start --channel dingtalk --token YOUR_TOKEN
viber start --channel wecom --corpid YOUR_CORP
```

---

## 📚 示例

### 🩹 Antigravity — AI 编码工具自愈

一个内置的技能示例，用于监控和恢复 AI 编码工具：

```yaml
# examples/jobs/antigravity-healer.yaml
name: antigravity-healer
schedule: "*/3 * * * * *"  # 每3秒
skill: antigravity
prompt: "检查 Antigravity IDE 状态，如有错误则自动恢复"
```

- **监控** 所有 IDE 窗口的智能体崩溃
- **自动恢复** 跨多窗口点击重试按钮
- **保持** 您的工作流不中断

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────┐
│              Viber 协作桌面                    │
│                                                 │
│  ┌──────────┐  ┌────────┐  ┌────────────────┐   │
│  │ViberAgent│──│ Agents │──│     Tools      │   │
│  │ (领导者) │  │ (工人) │  │(浏览器/文件)    │   │
│  └──────────┘  └────────┘  └────────────────┘   │
│        │                                        │
│   ┌────┴─────────────────────┐                  │
│   │         Scheduler        │                  │
│   │     (YAML 定时任务)       │                  │
│   └──────────────────────────┘                  │
│        │                                        │
│   ┌────┴─────────────────────┐                  │
│   │         Channels         │                  │
│   │   钉钉 | 企业微信 | Web   │                  │
│   └──────────────────────────┘                  │
└─────────────────────────────────────────────────┘
          ↓                    ↓
      仅出站连接           本地执行
```

## 📦 三大支柱

| 组件 | 功能 | 位置 |
|------|------|------|
| **Jobs** | 定时任务 (YAML cron) | `examples/jobs/` |
| **Skills** | 能力定义 (SKILL.md) | `skills/` |
| **Tools** | 底层原语 | `src/tools/` |

## 📊 对比

| | Viber | 云端代理 | IDE 插件 |
|---|:---:|:---:|:---:|
| 部署 | 本地应用 | 云服务器 | 仅编辑器 |
| 连接 | 出站 | 入站 | 无 |
| 任务 | YAML cron | 复杂代码 | 手动 |
| 隐私 | 100% 本地 | 数据外泄 | 不定 |
| 渠道 | 钉钉/企业微信 | WhatsApp/Telegram | 无 |

---

## 🤝 贡献

欢迎贡献！请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解指南。

## 📄 许可证

本项目采用 [Apache License 2.0](./LICENSE) 许可。

```
Copyright 2024-2026 Dustland

根据 Apache License 2.0 许可；
除非遵守许可证，否则不得使用此文件。
您可以在以下位置获取许可证副本：

    http://www.apache.org/licenses/LICENSE-2.0
```

### 🙏 致谢

Viber 基于以下优秀开源项目构建：

- [Vercel AI SDK](https://sdk.vercel.ai) — 统一 LLM 接口
- [Model Context Protocol](https://modelcontextprotocol.io) — 标准化工具集成
- [Croner](https://github.com/hexagon/croner) — 轻量级定时调度
- [Zod](https://zod.dev) — TypeScript 优先的模式验证

---

<div align="center">

**[官网][viber-site]** · **[文档][docs-site]** · **[问题反馈][github-issues]**

由 [Dustland](https://dustland.ai) ❤️ 打造

如果 Viber 对您有帮助，请在 GitHub 上给我们 ⭐ 星标！

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
