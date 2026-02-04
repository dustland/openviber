# Installation

Get started with Viber by installing it as a dependency or using it globally.

## Prerequisites

- Node.js 18 or later
- pnpm (recommended) or npm

## Install as a Dependency

Add Viber to your project:

```bash
pnpm add openviber
```

## Install Globally

Install Viber CLI globally to use it from anywhere:

```bash
pnpm add -g openviber
```

## Environment Setup

Viber requires API keys for the AI providers you want to use. Create a `.env` file:

```bash
# OpenRouter (recommended - access to multiple models)
OPENROUTER_API_KEY=your_key_here

# Or use specific providers
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Verify Installation

Check that Viber is installed correctly:

```bash
openviber --version
```

## Next Steps

- [Quick Start](/docs/getting-started/quick-start) - Create your first viber
- [Viber](/docs/concepts/viber) - Understand the viber concept
