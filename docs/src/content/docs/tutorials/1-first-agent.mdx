---
title: "Tutorial 1: Your First Agent"
---

**⏱️ Time: 15 minutes | 🎯 Goal: Create a persistent workspace with XAgent**

In this tutorial, you'll create your first Viber workspace — a persistent environment where you collaborate with XAgent. This is the foundation for everything else you'll build with Viber.

## What You'll Learn

- Creating a Space and XAgent
- Streaming responses from the agent
- Persisting your workspace
- Resuming sessions across runs

## Prerequisites

- Node.js 18+ installed
- pnpm or npm
- An LLM API key (OpenAI, Anthropic, or DeepSeek)

---

## Step 1: Set Up Your Project

Create a new project directory:

```bash
mkdir my-first-agent
cd my-first-agent
pnpm init
```

Install dependencies:

```bash
pnpm add viber dotenv
pnpm add -D typescript tsx @types/node
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true
  }
}
```

Your project structure should look like this:

```
my-first-agent/
├── src/
│   └── index.ts       # Main application
├── .env               # API key (create this)
├── package.json
└── tsconfig.json
```

## Step 2: Set Up Your Environment

Create a `.env` file:

```bash
OPENAI_API_KEY=sk-your-key-here
# Or use ANTHROPIC_API_KEY or DEEPSEEK_API_KEY
```

## Step 3: Create Your First Workspace

Create `src/index.ts`:

```typescript
import "dotenv/config";
import { XAgent } from "viber";

async function main() {
  console.log("🤖 My First Viber Agent\n");

  // Create a new Space with XAgent
  const xAgent = await XAgent.start("Help me write a blog post about AI");
  const space = xAgent.getSpace();

  console.log(`✨ Created Space: ${space.spaceId}`);
  console.log(`📋 Goal: ${space.goal}\n`);

  // Stream a response from XAgent
  console.log("🤖 XAgent: ");
  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: "Hi! Can you help me brainstorm some topics for my AI blog?",
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  // Print the streamed response
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Save the workspace state
  await space.persistState();
  console.log(`💾 Workspace saved! Space ID: ${space.spaceId}`);
}

main().catch(console.error);
```

### Understanding the Code

- **`XAgent.start(goal)`**: Creates a new Space with a goal and returns an XAgent
- **`xAgent.getSpace()`**: Gets the Space object for persistence and metadata
- **`xAgent.streamText()`**: Streams a response from the agent
- **`space.persistState()`**: Saves the workspace so you can resume later

## Step 4: Run Your Agent

Add a script to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts"
  }
}
```

Run your agent:

```bash
pnpm start
```

You should see:

```
🤖 My First Viber Agent

✨ Created Space: space_abc123xyz
📋 Goal: Help me write a blog post about AI

🤖 XAgent: Great! I'd be happy to help you brainstorm topics for your AI blog...

💾 Workspace saved! Space ID: space_abc123xyz
```

## Step 5: Resume Your Workspace

This is Viber's superpower — **persistent workspaces**. Create `src/resume.ts`:

```typescript
import "dotenv/config";
import { XAgent } from "viber";

async function main() {
  const spaceId = process.env.SPACE_ID;

  if (!spaceId) {
    console.log("❌ No SPACE_ID provided!");
    console.log("\nFirst, run: pnpm start");
    console.log("Then, run: SPACE_ID=<your-space-id> pnpm resume");
    process.exit(1);
  }

  console.log(`📂 Resuming Space: ${spaceId}\n`);

  // Resume the existing space
  const xAgent = await XAgent.resume(spaceId);
  const space = xAgent.getSpace();

  // Show what we have
  console.log("📋 Previous context:");
  console.log(`   Space: ${space.name}`);
  console.log(`   Goal: ${space.goal}`);
  console.log(`   Messages: ${space.history.messages.length}`);

  // Continue the conversation - XAgent remembers everything!
  console.log("\n🤖 Continuing our conversation...\n");

  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: "Let's go with the first topic you suggested. Can you write an outline?",
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Save progress
  await space.persistState();
  console.log("💾 Progress saved!");
}

main().catch(console.error);
```

Add the script:

```json
{
  "scripts": {
    "start": "tsx src/index.ts",
    "resume": "tsx src/resume.ts"
  }
}
```

Run the resume script:

```bash
SPACE_ID=space_abc123xyz pnpm resume
```

## 🎉 Congratulations!

You've successfully built your first Viber workspace! Here's what you accomplished:

✅ **Created a persistent Space** with XAgent  
✅ **Streamed responses** in real-time  
✅ **Saved the workspace** for later use  
✅ **Resumed the session** with full context preserved  

## 💡 Key Concepts Learned

- **Space**: A persistent container for all your work
- **XAgent**: Your AI project manager that coordinates the workspace
- **Streaming**: Real-time response generation for better UX
- **Persistence**: Your work survives across sessions

## The Viber Difference

Unlike traditional agent frameworks that execute and terminate, Viber workspaces are **persistent**:

```typescript
// Day 1: Start writing
const xAgent = await XAgent.start("Write my thesis");
await xAgent.streamText({...});
await space.persistState();

// Day 2: Continue where you left off
const xAgent = await XAgent.resume(spaceId);
// XAgent remembers everything from Day 1!
await xAgent.streamText({...});
```

## 🚀 What's Next?

Your agent works great, but it's working alone. In [Tutorial 2: Multi-Agent Collaboration](/docs/tutorials/2-multi-agent), you'll learn how to create teams of specialist agents that work together.

### Preview: What You'll Build Next

- A **researcher** agent that gathers information
- A **writer** agent that creates content
- **Agent coordination** where specialists collaborate
- **Collaborative workflows** where the whole is greater than the sum

## 🔧 Troubleshooting

**Agent not responding?**

- Check your API key is set correctly in `.env`
- Verify your internet connection
- Ensure `dotenv/config` is imported

**"Cannot find module" errors?**

- Run `pnpm install` to install dependencies
- Check your `tsconfig.json` configuration

**Want to experiment?**

- Try different goals when creating the Space
- Ask follow-up questions to see context preservation
- Explore the `space` object properties

---

Ready for the next challenge? Continue to [Tutorial 2: Multi-Agent Collaboration](/docs/tutorials/2-multi-agent)! 🚀
