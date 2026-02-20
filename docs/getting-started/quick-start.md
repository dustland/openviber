---
title: "Quick Start"
description: "Get OpenViber running in minutes"
---

# Quick Start

Get your first task up and running in minutes.

## 1. Fastest Way (npx)

The fastest way to get started is using `npx`:

```bash
# 1. Set your API key (OpenRouter recommended)
export OPENROUTER_API_KEY="your_api_key_here"

# 2. Run Onboarding
npx openviber onboard

# 3. Start OpenViber (Standalone)
npx openviber start
```

This starts the **Viber** on your machine. You can now use the CLI to interact with it.

## 2. Interactive Chat

OpenViber integrates with your terminal. Open a new terminal window:

```bash
# Chat with your running task
npx openviber chat
```

## 3. Development Setup (Source)

If you want the full experience with the **Viber Board (Web UI)** or want to contribute:

### Prerequisites
- **Node.js** v18+ and **pnpm** (recommended)
- **tmux** installed (`brew install tmux` on macOS)

### Installation
```bash
# Clone the repo
git clone https://github.com/dustland/openviber.git
cd openviber
pnpm install

# Configure environment
cp .env.example .env
# Add your OPENROUTER_API_KEY to .env
```

### Launch
```bash
# Start the full stack (Gateway, Viber, and Web UI)
pnpm dev
```

Open [http://localhost:6006](http://localhost:6006) to see the Viber Board.

## Next Steps

- [Introduction](/docs/introduction) — What OpenViber is and how it works
- [Viber](/docs/concepts/viber) — The Viber Runtime & Tasks
- [Tools](/docs/concepts/tools) — Available actions
- [Skills](/docs/concepts/skills) — Add domain knowledge
- [Jobs](/docs/concepts/jobs) — Set up scheduled tasks
