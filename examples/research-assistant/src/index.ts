/**
 * Research Assistant Example
 *
 * Demonstrates VibeX's knowledge accumulation capabilities.
 * Unlike one-shot research tools, this assistant builds a persistent
 * knowledge base that grows across sessions.
 *
 * Key Features Demonstrated:
 * - Knowledge accumulation across sessions
 * - Context preservation
 * - Research synthesis
 */

import "dotenv/config";
import { XAgent, Space } from "viber";
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
  console.log("\n🔬 Research Assistant - VibeX Demo");
  console.log("━".repeat(50));
  console.log("Build a persistent knowledge base across sessions.");
  console.log("Your research accumulates and synthesizes over time.\n");

  const existingSpaceId = process.env.RESEARCH_SPACE_ID;
  let space: Space;
  let xAgent: XAgent;

  if (existingSpaceId) {
    console.log(`📂 Found existing research space: ${existingSpaceId}`);
    const resume = await prompt("Resume previous research? (y/n): ");

    if (resume.toLowerCase() === "y") {
      console.log("\n⏳ Loading your research workspace...\n");
      xAgent = await XAgent.resume(existingSpaceId);
      space = xAgent.getSpace();
      showResearchSummary(space);
    } else {
      const result = await createNewResearch();
      xAgent = result.xAgent;
      space = result.space;
    }
  } else {
    const result = await createNewResearch();
    xAgent = result.xAgent;
    space = result.space;
  }

  console.log("\n💡 Commands:");
  console.log("  - Type questions to research");
  console.log("  - 'summary' - Show research summary");
  console.log("  - 'synthesize' - Generate research synthesis");
  console.log("  - 'quit' - Save and exit\n");

  while (true) {
    const input = await prompt("\n🔍 You: ");

    if (input.toLowerCase() === "quit") {
      console.log("\n💾 Saving research workspace...");
      await space.persistState();
      console.log(`\n✅ Research saved! Space ID: ${space.spaceId}`);
      break;
    }

    if (input.toLowerCase() === "summary") {
      showResearchSummary(space);
      continue;
    }

    if (input.toLowerCase() === "synthesize") {
      await synthesizeResearch(xAgent);
      continue;
    }

    // Research query
    console.log("\n🤖 Researcher: ");
    const stream = await xAgent.streamText({
      messages: [{ role: "user", content: input }],
      metadata: { mode: "agent", requestedAgent: "X" },
    });

    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log("\n");
  }

  rl.close();
}

async function createNewResearch(): Promise<{ xAgent: XAgent; space: Space }> {
  console.log("\n📚 Starting a new research project...\n");

  const topic = await prompt("What would you like to research? ");
  const xAgent = await XAgent.start(`Research: ${topic}`);
  const space = xAgent.getSpace();

  console.log(`\n✨ Created research workspace: ${space.spaceId}`);
  return { xAgent, space };
}

function showResearchSummary(space: Space) {
  console.log("\n📊 Research Summary:");
  console.log("━".repeat(40));
  console.log(`Topic: ${space.name}`);
  console.log(`Goal: ${space.goal}`);
  console.log(`Messages: ${space.history.messages.length}`);
  console.log(`Sessions: Accumulated context preserved`);
}

async function synthesizeResearch(xAgent: XAgent) {
  console.log("\n🧪 Synthesizing research findings...\n");

  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: `Based on all the research we've done in this space, create a comprehensive synthesis:
1. Key findings
2. Common themes
3. Contradictions or debates
4. Knowledge gaps
5. Recommendations for further research`,
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");
}

main().catch(console.error);
