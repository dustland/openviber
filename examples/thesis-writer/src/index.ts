/**
 * Thesis Writer Example
 *
 * Demonstrates VibeX's core capability: persistent workspaces where
 * documents evolve through continuous collaboration across sessions.
 *
 * Key Features Demonstrated:
 * - Multi-session persistence
 * - Context accumulation
 * - Plan management
 */

import "dotenv/config";
import { XAgent, Space } from "viber";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let latestPlanText: string | null = null;

const SAMPLE_TOPICS = [
  "Human-AI collaboration for creative writing",
  "Climate-smart agriculture strategies",
  "Ethical frameworks for autonomous robotics",
  "Sustainable urban transportation planning",
];

const SECTION_TEMPLATES = [
  "Introduction",
  "Problem Statement",
  "Literature Review",
  "Methodology",
  "Results & Analysis",
  "Discussion",
  "Conclusion",
];

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function chooseFromMenu(
  question: string,
  options: string[]
): Promise<number> {
  while (true) {
    console.log(`\n${question}`);
    options.forEach((option, idx) => {
      console.log(`  ${idx + 1}. ${option}`);
    });
    const input = await prompt("Select an option: ");
    const choice = parseInt(input.trim(), 10);
    if (!Number.isNaN(choice) && choice >= 1 && choice <= options.length) {
      return choice - 1;
    }
    console.log("❌ Invalid choice. Please enter a valid number.");
  }
}

async function pickThesisTopic(): Promise<string> {
  const choice = await chooseFromMenu("Choose a thesis topic:", [
    ...SAMPLE_TOPICS,
    "Something else (enter a custom topic)",
  ]);

  if (choice < SAMPLE_TOPICS.length) {
    return SAMPLE_TOPICS[choice];
  }

  const custom = await prompt("Describe your thesis topic: ");
  return custom.trim() || "General thesis topic";
}

async function writeSection(space: Space, xAgent: XAgent): Promise<void> {
  const choice = await chooseFromMenu("Which section should we work on?", [
    ...SECTION_TEMPLATES,
    "Something else",
  ]);

  let sectionName: string;
  if (choice < SECTION_TEMPLATES.length) {
    sectionName = SECTION_TEMPLATES[choice];
  } else {
    sectionName =
      (await prompt("Describe the section you want to work on: ")).trim() ||
      "Custom section";
  }

  console.log(`\n✍️  Writing ${sectionName}...`);
  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: `Write the ${sectionName} section for our thesis. Focus on "${space.goal}" and build on what we already have. Include clear subheadings when helpful.`,
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");
}

async function main() {
  console.log("\n🎓 Thesis Writer - VibeX Demo");
  console.log("━".repeat(50));
  console.log("This example demonstrates multi-session document evolution.");
  console.log(
    "Your thesis will persist across sessions and improve over time.\n"
  );

  // Check for existing space
  const existingSpaceId = process.env.THESIS_SPACE_ID;

  let space: Space;
  let xAgent: XAgent;

  if (existingSpaceId) {
    console.log(`📂 Found existing space: ${existingSpaceId}`);
    const resume = await prompt("Resume previous session? (y/n): ");

    if (resume.toLowerCase() === "y") {
      console.log("\n⏳ Resuming your thesis workspace...\n");
      xAgent = await XAgent.resume(existingSpaceId);
      space = xAgent.getSpace();

      // Show progress
      console.log(`📋 Space: ${space.name}`);
      console.log(`📊 Goal: ${space.goal}`);
      console.log(`💬 Messages: ${space.history.messages.length}`);
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

  // Ensure a plan exists (and show it once)
  await showOrCreatePlan(space, xAgent);

  console.log("\n💡 Use the menu to drive the session. No guesswork needed!");

  // Menu-driven workflow
  let running = true;
  while (running) {
    const action = await chooseFromMenu("What would you like to do next?", [
      "Write a thesis section",
      "Ask a custom question/instruction",
      "Show the current plan",
      "Show status & progress",
      "Save and exit",
    ]);

    switch (action) {
      case 0:
        await writeSection(space, xAgent);
        break;
      case 1: {
        const input = await prompt("\n📝 Enter your request: ");
        console.log("\n🤖 X: ");
        const stream = await xAgent.streamText({
          messages: [{ role: "user", content: input }],
          metadata: { mode: "agent", requestedAgent: "X" },
        });
        for await (const chunk of stream.textStream) {
          process.stdout.write(chunk);
        }
        console.log("\n");
        break;
      }
      case 2:
        await showOrCreatePlan(space, xAgent);
        break;
      case 3:
        showStatus(space);
        break;
      case 4:
        console.log("\n💾 Saving workspace...");
        await space.persistState();
        console.log(`\n✅ Workspace saved! Space ID: ${space.spaceId}`);
        console.log("Set THESIS_SPACE_ID in .env to resume later.\n");
        running = false;
        break;
      default:
        console.log("❌ Invalid choice.");
        break;
    }
  }

  rl.close();
}

async function createNewSpace(): Promise<{ xAgent: XAgent; space: Space }> {
  console.log("\n📚 Starting a new thesis project...\n");

  const topic = await pickThesisTopic();
  const xAgent = await XAgent.start(`Write a thesis on: ${topic}`);
  const space = xAgent.getSpace();

  console.log(`\n✨ Created new workspace: ${space.spaceId}`);
  return { xAgent, space };
}

function showStatus(space: Space) {
  console.log("\n📊 Current Status:");
  console.log("━".repeat(40));
  console.log(`Space: ${space.name}`);
  console.log(`Goal: ${space.goal}`);
  console.log(`Messages: ${space.history.messages.length}`);

  if (latestPlanText) {
    console.log("\nMost recent plan:\n");
    console.log(latestPlanText);
  } else {
    console.log(
      "\nNo plan created yet. Choose 'Show the current plan' to create one."
    );
  }
}

async function showOrCreatePlan(space: Space, xAgent: XAgent) {
  if (latestPlanText) {
    console.log("\n📋 Current Plan:");
    console.log("━".repeat(40));
    console.log(latestPlanText);
    return;
  }

  console.log("\n📋 Creating a plan for your thesis...\n");

  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content:
          "Create a detailed plan for writing this thesis. Break it down into clear tasks.",
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  let buffer = "";
  for await (const chunk of stream.textStream) {
    const text = typeof chunk === "string" ? chunk : String(chunk);
    buffer += text;
    process.stdout.write(text);
  }
  latestPlanText = buffer.trim();
  console.log("\n");
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "completed":
      return "✅";
    case "running":
      return "🔄";
    case "pending":
      return "⏳";
    case "failed":
      return "❌";
    case "blocked":
      return "🚫";
    default:
      return "○";
  }
}

main().catch(console.error);
