# Quick Start

Get your first viber running in under 2 minutes.

## 1. Set Your API Key

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys)

## 2. Run Your First Task

Let's have your viber analyze your project and generate documentation:

```bash
cd your-project
npx openviber run "Analyze this codebase and create a comprehensive README.md with project overview, setup instructions, and usage examples"
```

If you install the package, you can also use the shorter alias `viber` (e.g. `viber start`).

Watch as your viber:
1. Scans the directory structure
2. Reads key files to understand the project
3. Generates a polished README
4. Saves it to your project

## 3. Try Something Interactive

Start the full viber for back-and-forth conversations:

```bash
npx openviber start
```

Or chat directly from your terminal (great inside tmux):

```bash
openviber chat
```

Open http://localhost:6006 and try:

> "Find all the TODOs in this project, prioritize them, and create a task list"

Or:

> "I want to add dark mode to my app. Research best practices and show me how to implement it"

## More Ideas

| What you say | What happens |
|--------------|--------------|
| "Summarize the last 10 commits" | Reads git log, explains changes |
| "Write tests for the auth module" | Analyzes code, generates test file |
| "Deploy this to Vercel" | Runs CLI commands, configures deployment |
| "Research competitors and write analysis" | Searches web, creates report |

## What's Next?

- **[Onboarding](/docs/getting-started/installation)** — Persistent config & customization
- **[Jobs](/docs/concepts/jobs)** — Schedule daily summaries, monitoring
- **[Skills](/docs/concepts/skills)** — Add domain knowledge (GitHub, Jira, etc.)
