# Quick Start

Create and run your first Viber agent in minutes.

## 1. Personalize Your Agent (Recommended)

Before starting, set up the three configuration files that make your agent actually useful:

```bash
# Create the config directory
mkdir -p ~/.openviber

# Create the three core files
touch ~/.openviber/soul.md    # How your agent communicates
touch ~/.openviber/user.md    # Who you are and what you're working on
touch ~/.openviber/memory.md  # What your agent remembers
```

### Minimal soul.md

```markdown
# Soul

## Communication Style
- Be direct and concise. Skip preambles.
- Lead with the answer, then explain.
- Push back on requests when there's a better approach.

## Boundaries
- Confirm before taking actions that affect external systems.
- Ask clarifying questions before complex tasks.
```

### Minimal user.md

```markdown
# User Context

## Identity
- Name: [Your name]
- Role: [Your role]
- Timezone: [Your timezone]

## Current Focus
- Primary project: [What you're working on]
- Current priority: [Most important task]

## Preferences
- Language: [TypeScript/Python/etc.]
- Package manager: [pnpm/npm/pip/etc.]
```

See [Personalization Architecture](/docs/design/personalization) for detailed guidance on configuring these files effectively.

## 2. Start the Daemon

Launch the Viber daemon to enable agent execution:

```bash
openviber start
```

This starts the Viber server on port 8080 by default.

## Create an Agent

You can create agents programmatically or via configuration.

### Programmatic Approach

```typescript
// Create and start an agent
const agent = await ViberAgent.start("Build a simple todo app", {
  name: "TodoBuilder",
  model: "anthropic/claude-3.5-sonnet",
});

// The agent will:
// 1. Create a plan
// 2. Break it into tasks
// 3. Execute each task
// 4. Save artifacts (code, docs, etc.)
```

### Configuration File

Create a job configuration in YAML:

```yaml
# jobs/my-agent.yaml
name: MyFirstAgent
goal: Create a README file for a new project
model: anthropic/claude-3.5-sonnet
config:
  autoApprove: true
  maxIterations: 10
```

Run it with:

```bash
openviber run jobs/my-agent.yaml
```

## Monitor Progress

The agent will output its progress to the console. You can also:

1. Use the [Viber Board](/vibers) to monitor agents in real-time
2. Check the `artifacts/` directory for generated files
3. View logs in the `logs/` directory

## Example: Research Agent

Here's a more complete example:

```typescript
const agent = await ViberAgent.start(
  "Research the latest trends in AI and write a summary report",
  {
    name: "Researcher",
    model: "anthropic/claude-3.5-sonnet",
    tools: ["web_search", "file_write", "browser"],
    config: {
      autoApprove: true,
    },
  }
);

// Wait for completion
const result = await agent.waitForCompletion();
console.log("Artifacts:", result.artifacts);
```

## Next Steps

- [Agents](/docs/concepts/agents) - Deep dive into agent capabilities
- [Tools](/docs/concepts/tools) - Learn about available tools
- [Spaces](/docs/concepts/spaces) - Understand workspaces
