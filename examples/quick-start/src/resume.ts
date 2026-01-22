/**
 * Resume Example - Continue where you left off
 *
 * This is VibeX's superpower: persistent workspaces.
 * Run basic.ts first, then run this with the SPACE_ID.
 */

import "dotenv/config";
import { XAgent } from "viber";

async function main() {
  const spaceId = process.env.SPACE_ID;

  if (!spaceId) {
    console.log("❌ No SPACE_ID provided!");
    console.log("\nFirst, run: pnpm basic");
    console.log("Then, run: SPACE_ID=<id> pnpm resume");
    process.exit(1);
  }

  console.log(`📂 Resuming Space: ${spaceId}\n`);

  // Resume the existing space (returns XAgent)
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
        content: "Now expand on what you wrote before. Add more details.",
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
