/**
 * Streaming Example - Real-time responses
 *
 * Shows how to stream responses from XAgent for a better UX.
 */

import "dotenv/config";
import { XAgent } from "viber";

async function main() {
  const xAgent = await XAgent.start("Creative writing assistant");
  const space = xAgent.getSpace();

  console.log("🎭 Creative Writing Assistant\n");
  console.log("Generating a short story...\n");
  console.log("━".repeat(50));

  // Stream the response
  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content:
          "Write a 3-paragraph short story about a robot learning to paint",
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  // Print chunks as they arrive
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n" + "━".repeat(50));
  console.log("\n✅ Story complete!");

  // Save space state
  await space.persistState();
  console.log(`\n💾 Space saved: ${space.spaceId}`);
}

main().catch(console.error);
