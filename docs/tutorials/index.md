---
title: "Tutorials (Deprecated)"
---

::: caution
These tutorials describe the old multi-agent/dev-framework positioning. Viber is now a workspace-first, openclaw-alike system that keeps context in `~/.openviber/` and assumes a single assistant path by default. Use these pages only as historical reference.
:::

Welcome to the _legacy_ Viber learning path. It walks through multi-agent examples that no longer match the current architecture. For the active model (workspace-first, single-assistant default), see the Design docs instead.

## 🎯 Learning Path Overview

**Core Tutorial Sequence:**

1. [Tutorial 1: Your First Agent](/docs/tutorials/1-first-agent) (15 minutes)
2. [Tutorial 2: Multi-Agent Teams](/docs/tutorials/2-multi-agent) (30 minutes)
3. [Tutorial 3: Custom Tools](/docs/tutorials/3-custom-tools) (45 minutes)
4. [Tutorial 4: Configuration Deep Dive](/docs/tutorials/4-configuration) (30 minutes)

**Advanced Examples:**

- [Comprehensive Systems](/docs/tutorials/91-comprehensive-systems) (60 minutes) — Putting it all together

## 📚 Tutorial Series

### [Tutorial 1: Your First Agent](/docs/tutorials/1-first-agent)

**⏱️ Time: 15 minutes | 🎯 Goal: Create a persistent workspace**

Learn the fundamentals by creating your first Viber workspace with XAgent. This tutorial covers:

- Setting up a TypeScript project with Viber
- Creating a Space and XAgent
- Streaming responses from the agent
- Persisting and resuming workspaces

**Perfect for**: Complete beginners to Viber

---

### [Tutorial 2: Multi-Agent Collaboration](/docs/tutorials/2-multi-agent)

**⏱️ Time: 30 minutes | 🎯 Goal: Build a writer-researcher team**

Create a team of specialized agents that work together! Build a system where researchers gather information and writers create content. Learn:

- Multi-agent orchestration with XAgent
- Specialist agents and their roles
- How agents coordinate within a Space
- Building collaborative workflows

**Perfect for**: Developers ready to explore multi-agent systems

---

### [Tutorial 3: Custom Tools](/docs/tutorials/3-custom-tools)

**⏱️ Time: 45 minutes | 🎯 Goal: Create agents with custom capabilities**

Give your agents superpowers by creating custom tools that extend their capabilities. This tutorial covers:

- Custom tool development in TypeScript
- Tool integration with agents
- External API usage
- Advanced agent capabilities

**Perfect for**: Developers wanting to extend agent functionality

---

### [Tutorial 4: Configuration Deep Dive](/docs/tutorials/4-configuration)

**⏱️ Time: 30 minutes | 🎯 Goal: Master Space and Agent configuration**

Learn how to configure every aspect of your Viber workspace. This tutorial covers:

- Agent configuration with YAML
- LLM provider settings
- Tool permissions and security
- Production deployment patterns

**Perfect for**: Developers preparing for production

---

### [Advanced: Comprehensive Systems](/docs/tutorials/91-comprehensive-systems)

**⏱️ Time: 60 minutes | 🎯 Goal: Build a scalable, production-ready system**

Build something serious! Create a comprehensive research system with multiple specialized agents and production features:

- Advanced multi-agent architectures
- Persistent storage with Supabase
- Error handling and resilience
- Production deployment patterns

**Perfect for**: Developers who want to see how all Viber concepts work together

---

## 🚀 Getting Started

### Prerequisites

Before starting the tutorials, make sure you have:

1. **Node.js 18+** installed
2. **pnpm** installed (`npm install -g pnpm`)
3. **API Key** — OpenAI, Anthropic, or DeepSeek
4. **Basic TypeScript knowledge** — understanding of async/await is helpful

### Quick Setup

```bash
# Create a new project
mkdir my-viber-project
cd my-viber-project
pnpm init

# Install dependencies
pnpm add viber dotenv

# Install dev dependencies
pnpm add -D typescript tsx @types/node

# Create tsconfig.json
echo '{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  }
}' > tsconfig.json

# Create .env file
echo "OPENAI_API_KEY=your-key-here" > .env
```

### Recommended Learning Path

1. **Start with Tutorial 1** — Even if you're experienced, this establishes the Viber patterns
2. **Progress sequentially** — Each tutorial builds on the previous concepts
3. **Run the examples** — Hands-on practice is essential
4. **Experiment** — Modify the examples to explore different approaches

### Time Investment

- **Quick learner**: 2-3 hours total
- **Thorough learner**: 4-5 hours with experimentation
- **Production focus**: Add 2-3 hours for deployment exploration

## 💡 What You'll Build

By the end of this tutorial series, you'll have built:

- ✅ A persistent workspace with XAgent
- ✅ A multi-agent research and writing team
- ✅ An agent with custom tools
- ✅ A production-ready configuration
- ✅ A comprehensive research system

## 🎯 Learning Outcomes

After completing all tutorials, you'll understand:

- **Core Concepts**: Spaces, XAgent, Artifacts, and tools
- **TypeScript API**: Complete Viber SDK usage
- **Development Patterns**: Best practices for Viber applications
- **Production Deployment**: Scalable, maintainable agent systems
- **Custom Extensions**: Building tools and integrations

## 📖 Additional Resources

### Quick References

- [SDK Reference](/sdk) — Complete API documentation
- [Configuration Guide](/docs/reference/configuration) — Detailed configuration options
- [Design Principles](/docs/design) — Architecture deep dive

### Example Projects

Check out these complete examples in the Viber repository:

| Example | Description |
| ------- | ----------- |
| [Quick Start](https://github.com/dustland/viber/tree/main/examples/quick-start) | Get started in 5 minutes |
| [Thesis Writer](https://github.com/dustland/viber/tree/main/examples/thesis-writer) | Multi-session document evolution |
| [Research Assistant](https://github.com/dustland/viber/tree/main/examples/research-assistant) | Knowledge accumulation |
| [Code Review](https://github.com/dustland/viber/tree/main/examples/code-review) | Collaborative code review |

### Community & Support

- [GitHub Repository](https://github.com/dustland/viber) — Source code and issues
- [GitHub Discussions](https://github.com/dustland/viber/discussions) — Community support

---

Ready to start building? Begin with [Tutorial 1: Your First Agent](/docs/tutorials/1-first-agent)! 🚀
