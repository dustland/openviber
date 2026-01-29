# Quick Start

Create and run your first Viber agent in minutes.

## Start the Daemon

Launch the Viber daemon to enable agent execution:

```bash
viber start
```

This starts the Viber server on port 8080 by default.

## Create an Agent

You can create agents programmatically or via configuration.

### Programmatic Approach

```typescript
import { ViberAgent } from "@dustland/viber";

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
viber run jobs/my-agent.yaml
```

## Monitor Progress

The agent will output its progress to the console. You can also:

1. Use the [Viber Cockpit](/vibers) to monitor agents in real-time
2. Check the `artifacts/` directory for generated files
3. View logs in the `logs/` directory

## Example: Research Agent

Here's a more complete example:

```typescript
import { ViberAgent } from "@dustland/viber";

const agent = await ViberAgent.start(
  "Research the latest trends in AI and write a summary report",
  {
    name: "Researcher",
    model: "anthropic/claude-3.5-sonnet",
    tools: ["web_search", "file_write", "browser"],
    config: {
      autoApprove: true,
    },
  },
);

// Wait for completion
const result = await agent.waitForCompletion();
console.log("Artifacts:", result.artifacts);
```

## Next Steps

- [Agents Guide](/docs/guides/agents) - Deep dive into agent capabilities
- [Tools Guide](/docs/guides/tools) - Learn about available tools
- [Spaces Guide](/docs/guides/spaces) - Understand workspaces
