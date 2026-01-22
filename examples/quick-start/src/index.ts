/**
 * Interactive Quick Start
 *
 * A simple interactive demo of VibeX capabilities.
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
  console.log("\n⚡ VibeX Quick Start");
  console.log("━".repeat(40));

  // Check for existing space
  const existingId = process.env.SPACE_ID || undefined;
  let xAgent: XAgent;
  let space: Space;

  if (existingId) {
    const resume = await prompt(`Resume space ${existingId}? (y/n): `);
    if (resume.toLowerCase() === "y") {
      xAgent = await XAgent.resume(existingId);
      space = xAgent.getSpace();
      console.log(
        `\n✅ Resumed! ${space.history.messages.length} messages loaded.`
      );
    } else {
      const goal = await prompt("What would you like to work on? ");
      xAgent = await XAgent.start(goal);
      space = xAgent.getSpace();
    }
  } else {
    const goal = await prompt("What would you like to work on? ");
    xAgent = await XAgent.start(goal);
    space = xAgent.getSpace();
    console.log(`\n✨ Created: ${space.spaceId}`);
  }

  console.log("\nType messages to chat. 'quit' to exit.\n");

  while (true) {
    const input = await prompt("You: ");

    if (input.toLowerCase() === "quit") {
      await space.persistState();
      console.log(`\n💾 Saved! Resume with: SPACE_ID=${space.spaceId}`);
      break;
    }

    process.stdout.write("AI: ");
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

main().catch(console.error);
