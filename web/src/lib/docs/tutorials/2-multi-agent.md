---
title: "Tutorial 2: Multi-Agent Collaboration"
---


**⏱️ Time: 30 minutes | 🎯 Goal: Build a researcher-writer team**

Now let's create a team of agents that work together! You'll build a system where XAgent coordinates specialist agents — a researcher gathers information and a writer creates content. This introduces the powerful concept of multi-agent collaboration.

## What You'll Learn

- How XAgent coordinates specialist agents
- Using different agent modes
- Building collaborative workflows
- Managing multi-step tasks

## Prerequisites

- Completed [Tutorial 1: Your First Agent](/docs/tutorials/1-first-agent)
- Understanding of basic Viber concepts
- An LLM API key

---

## Understanding Multi-Agent Architecture

In Viber, **XAgent** acts as the project manager. It coordinates specialist agents:

```
User → XAgent → [Researcher, Writer, Developer, ...]
                      ↓
                 Task Completion
```

The specialist agents include:

| Agent | Role |
| ----- | ---- |
| **Researcher** | Gathers information and sources |
| **Writer** | Creates content and documentation |
| **Developer** | Writes and reviews code |
| **Reviewer** | Provides quality assurance |
| **Web Designer** | Creates HTML/CSS experiences |

## Step 1: Project Setup

Create a new project:

```bash
mkdir research-writer-team
cd research-writer-team
pnpm init
pnpm add viber dotenv
pnpm add -D typescript tsx @types/node
```

Create your project structure:

```
research-writer-team/
├── src/
│   └── index.ts       # Main application
├── .env               # API key
├── package.json
└── tsconfig.json
```

## Step 2: Create a Collaborative Workflow

Create `src/index.ts`:

```typescript
import "dotenv/config";
async function main() {
  console.log("✍️  Research & Writing Team Demo");
  console.log("Watch as XAgent coordinates specialist agents!\n");
  console.log("═".repeat(50));

  // Create a workspace for our research project
  const xAgent = await XAgent.start(
    "Research and write an article about sustainable energy"
  );
  const space = xAgent.getSpace();

  console.log(`✨ Created Space: ${space.spaceId}`);
  console.log(`📋 Goal: ${space.goal}\n`);

  // Phase 1: Research
  console.log("📚 Phase 1: Research");
  console.log("─".repeat(40));

  const researchStream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: `Please research the current state of sustainable energy. 
Focus on:
1. Solar and wind energy trends
2. Recent breakthroughs
3. Key statistics

Gather comprehensive information for an article.`,
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of researchStream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Phase 2: Writing
  console.log("\n✍️  Phase 2: Writing");
  console.log("─".repeat(40));

  const writeStream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: `Based on the research you've gathered, write a 500-word article about sustainable energy. 
Include:
- An engaging introduction
- Key findings from your research
- Future outlook
- A compelling conclusion`,
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of writeStream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Phase 3: Review
  console.log("\n🔍 Phase 3: Review");
  console.log("─".repeat(40));

  const reviewStream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content:
          "Review the article you just wrote. Check for clarity, flow, and accuracy. Suggest any improvements.",
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of reviewStream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Save the workspace
  await space.persistState();

  console.log("═".repeat(50));
  console.log("🎉 Collaboration complete!");
  console.log(`💾 Space saved: ${space.spaceId}`);
  console.log(
    "\nYou can resume this workspace later to continue refining the article."
  );
}

main().catch(console.error);
```

## Step 3: Run the Collaborative Team

Add scripts to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts"
  }
}
```

Run the team:

```bash
pnpm start
```

You'll see something like:

```
✍️  Research & Writing Team Demo
Watch as XAgent coordinates specialist agents!

══════════════════════════════════════════════════
✨ Created Space: space_abc123xyz
📋 Goal: Research and write an article about sustainable energy

📚 Phase 1: Research
────────────────────────────────────────
I'll research the current state of sustainable energy for you...

[XAgent gathers information and presents findings]

✍️  Phase 2: Writing
────────────────────────────────────────
Based on the research, I'll now write a comprehensive article...

[XAgent creates the article]

🔍 Phase 3: Review
────────────────────────────────────────
Let me review the article for clarity and accuracy...

[XAgent provides feedback]

══════════════════════════════════════════════════
🎉 Collaboration complete!
💾 Space saved: space_abc123xyz
```

## Step 4: Interactive Collaboration

Create an interactive version in `src/interactive.ts`:

```typescript
import "dotenv/config";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  console.log("🤝 Interactive Multi-Agent Collaboration\n");

  // Check for existing space
  const existingSpaceId = process.env.SPACE_ID;

  let xAgent: XAgent;
  let space: Space;

  if (existingSpaceId) {
    console.log(`📂 Found existing space: ${existingSpaceId}`);
    const resume = await prompt("Resume previous session? (y/n): ");

    if (resume.toLowerCase() === "y") {
      xAgent = await XAgent.resume(existingSpaceId);
      space = xAgent.getSpace();
      console.log(`\n✨ Resumed: ${space.name}`);
      console.log(`📊 Previous messages: ${space.history.messages.length}`);
    } else {
      const result = await createNewSpace();
      xAgent = result.xAgent;
      space = result.space;
    }
  } else {
    const result = await createNewSpace();
    xAgent = result.xAgent;
    space = result.space;
  }

  console.log("\n💡 Commands:");
  console.log("   - Type your request to collaborate with XAgent");
  console.log("   - Type 'status' to see workspace info");
  console.log('   - Type "quit" to save and exit\n');

  // Main interaction loop
  while (true) {
    const input = await prompt("\n📝 You: ");

    if (input.toLowerCase() === "quit") {
      console.log("\n💾 Saving workspace...");
      await space.persistState();
      console.log(`✅ Saved! Space ID: ${space.spaceId}`);
      break;
    }

    if (input.toLowerCase() === "status") {
      console.log("\n📊 Workspace Status:");
      console.log(`   Space: ${space.name}`);
      console.log(`   Goal: ${space.goal}`);
      console.log(`   Messages: ${space.history.messages.length}`);
      continue;
    }

    if (!input.trim()) continue;

    console.log("\n🤖 XAgent: ");

    const stream = await xAgent.streamText({
      messages: [{ role: "user", content: input }],
      metadata: { mode: "agent", requestedAgent: "X" },
    });

    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log("");
  }

  rl.close();
}

async function createNewSpace(): Promise<{ xAgent: XAgent; space: Space }> {
  const topic = await prompt("What would you like to work on? ");
  const xAgent = await XAgent.start(topic || "Research and writing project");
  const space = xAgent.getSpace();

  console.log(`\n✨ Created new workspace: ${space.spaceId}`);
  return { xAgent, space };
}

main().catch(console.error);
```

Add the script:

```json
{
  "scripts": {
    "start": "tsx src/index.ts",
    "interactive": "tsx src/interactive.ts"
  }
}
```

Run:

```bash
pnpm interactive
```

## 🎉 Congratulations!

You've built your first multi-agent collaborative system! Here's what you accomplished:

✅ **Coordinated specialist agents** through XAgent  
✅ **Built multi-phase workflows** (research → write → review)  
✅ **Created interactive sessions** with persistent context  
✅ **Observed real-time collaboration** between AI agents  

## 💡 Key Concepts Learned

- **XAgent Coordination**: XAgent manages the overall workflow and delegates to specialists
- **Context Preservation**: All phases share context within the Space
- **Iterative Refinement**: Work improves through multiple passes
- **Persistent Collaboration**: Resume work at any time

## 🔍 Understanding the Collaboration

### Why This Works

1. **Unified Context**: All agents work within the same Space
2. **Accumulated Knowledge**: Each phase builds on previous work
3. **Natural Workflow**: Research → Write → Review mirrors how humans work
4. **Persistent State**: Everything is saved automatically

### Real-World Applications

- **Content Creation**: Blog posts, documentation, marketing copy
- **Research Projects**: Gather information, analyze, synthesize
- **Code Development**: Plan, implement, review, refine
- **Customer Service**: Triage, respond, follow-up

## 🚀 What's Next?

Your agents can collaborate, but they're still limited to built-in capabilities. In [Tutorial 3: Custom Tools](/docs/tutorials/3-custom-tools), you'll learn how to give your agents superpowers by creating custom tools that connect to external APIs and services.

### Preview: What You'll Build Next

- **Custom search tool** that fetches real data
- **File operations** for saving artifacts
- **External API integration** for enhanced capabilities
- **Tool permissions** and security

## 🔧 Troubleshooting

**Agents not responding well?**

- Try more specific prompts
- Break complex tasks into smaller steps
- Provide clear context about what you need

**Workflow getting stuck?**

- Check your API key and quota
- Verify network connectivity
- Try simpler requests to diagnose

**Want to experiment?**

- Try different types of content (technical docs, creative writing)
- Add more phases (outline → draft → revise → polish)
- Create domain-specific workflows

---

Ready to give your agents superpowers? Continue to [Tutorial 3: Custom Tools](/docs/tutorials/3-custom-tools)! 🛠️
