---
title: "Quick Start"
description: "Get OpenViber running in minutes"
---

# Quick Start

Get your AI teammate up and running in minutes.

## Prerequisites

- **Node.js** v18+ and **pnpm** (or npm)
- **tmux** installed (`brew install tmux` on macOS)
- An **API key** for your LLM provider (e.g., OpenRouter, OpenAI)

## 1. Install & Start

```bash
# Clone the repo
git clone https://github.com/dustland/openviber.git
cd openviber

# Install dependencies
pnpm install

# Set your API key
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY

# Start the daemon + web UI
pnpm dev
```

## 2. Open the Viber Board

Open [http://localhost:6006](http://localhost:6006) and try:

- **"Search for today's top tech news and summarize"**
- **"Create a README.md for this project"**
- **"Monitor my IDE and auto-recover errors"**

## 3. Use the CLI

```bash
# One-off task
openviber run "Analyze this codebase and create documentation"

# Interactive chat
openviber chat

# Start the hub server
openviber hub
```

## What's Happening

When you send a message, OpenViber:

1. Routes it through the **Hub** (WebSocket server on port 6007)
2. The **Daemon** picks it up and runs the **Agent**
3. The Agent uses **tools** (file, search, browser, etc.) and **skills** (tmux, cursor-agent)
4. Results stream back to the **Viber Board** in real-time

## Next Steps

- [Introduction](/docs/introduction) — What OpenViber is and how it works
- [Agents](/docs/concepts/agents) — Configure agent behavior
- [Tools](/docs/concepts/tools) — Available actions
- [Skills](/docs/concepts/skills) — Add domain knowledge
- [Jobs](/docs/concepts/jobs) — Set up scheduled tasks