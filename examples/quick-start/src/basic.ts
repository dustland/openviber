/**
 * Basic Example - The simplest way to use VibeX
 *
 * This shows the minimal code needed to:
 * 1. Create a Space with XAgent
 * 2. Stream a response from XAgent
 */

import "dotenv/config";
import { XAgent } from "viber";

async function main() {
  // 1. Start a new Space with a goal (returns XAgent)
  const xAgent = await XAgent.start("Help me write a blog post about AI");
  const space = xAgent.getSpace();

  console.log(`✨ Created Space: ${space.spaceId}\n`);

  // 2. Stream a response from XAgent
  console.log("🤖 XAgent: ");
  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: "Write a short introduction paragraph about AI in healthcare",
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  // Print the streamed response
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // 3. Save the space state
  await space.persistState();
  console.log(`💾 Saved! Resume with: SPACE_ID=${space.spaceId}`);
}

main().catch(console.error);
