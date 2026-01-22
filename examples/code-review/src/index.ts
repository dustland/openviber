/**
 * Code Review Example
 *
 * Demonstrates collaborative code review where:
 * - Code is discussed and analyzed
 * - Issues are tracked across sessions
 * - Review history is preserved
 */

import "dotenv/config";
import { XAgent, Space } from "viber";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

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
  console.log("\n🔍 Code Review Assistant - VibeX Demo");
  console.log("━".repeat(50));
  console.log("Collaborative code review with persistent feedback.\n");

  const existingId = process.env.REVIEW_SPACE_ID || undefined;
  let space: Space;
  let xAgent: XAgent;

  if (existingId) {
    const resume = await prompt(`Resume review ${existingId}? (y/n): `);
    if (resume.toLowerCase() === "y") {
      xAgent = await XAgent.resume(existingId);
      space = xAgent.getSpace();
      showReviewStatus(space);
    } else {
      const result = await startNewReview();
      xAgent = result.xAgent;
      space = result.space;
    }
  } else {
    const result = await startNewReview();
    xAgent = result.xAgent;
    space = result.space;
  }

  console.log("\n💡 Commands:");
  console.log("  - 'load <file>' - Load code file for review");
  console.log("  - 'review' - Start/continue code review");
  console.log("  - 'security' - Check for security issues");
  console.log("  - 'performance' - Check for performance issues");
  console.log("  - 'summary' - Generate review summary");
  console.log("  - 'quit' - Save and exit\n");

  while (true) {
    const input = await prompt("\n💻 You: ");

    if (input.toLowerCase() === "quit") {
      await space.persistState();
      console.log(`\n💾 Saved! Space ID: ${space.spaceId}`);
      break;
    }

    if (input.toLowerCase().startsWith("load ")) {
      await loadCodeFile(xAgent, input.slice(5).trim());
      continue;
    }

    if (input.toLowerCase() === "review") {
      await runReview(xAgent, "comprehensive");
      continue;
    }

    if (input.toLowerCase() === "security") {
      await runReview(xAgent, "security");
      continue;
    }

    if (input.toLowerCase() === "performance") {
      await runReview(xAgent, "performance");
      continue;
    }

    if (input.toLowerCase() === "summary") {
      await generateSummary(xAgent);
      continue;
    }

    // General question about the code
    console.log("\n🤖 Reviewer: ");
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

async function startNewReview(): Promise<{ xAgent: XAgent; space: Space }> {
  console.log("📝 Starting a new code review...\n");
  const description = await prompt("What are you reviewing? ");
  const xAgent = await XAgent.start(`Code Review: ${description}`);
  const space = xAgent.getSpace();

  console.log(`\n✨ Created review space: ${space.spaceId}`);
  return { xAgent, space };
}

function showReviewStatus(space: Space) {
  console.log("\n📊 Review Status:");
  console.log("━".repeat(40));
  console.log(`Review: ${space.name}`);
  console.log(`Messages: ${space.history.messages.length}`);
}

async function loadCodeFile(xAgent: XAgent, filePath: string) {
  try {
    const absolutePath = path.resolve(filePath);
    const content = fs.readFileSync(absolutePath, "utf-8");
    const fileName = path.basename(filePath);

    console.log(`\n📄 Loading "${fileName}" for review...\n`);

    const stream = await xAgent.streamText({
      messages: [
        {
          role: "user",
          content: `I'm loading this code file for review:\n\nFilename: ${fileName}\n\n\`\`\`\n${content}\n\`\`\`\n\nPlease acknowledge and provide initial observations.`,
        },
      ],
      metadata: { mode: "agent", requestedAgent: "X" },
    });

    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log("\n");
  } catch (error) {
    console.log(`\n❌ Could not load file: ${error}`);
  }
}

async function runReview(xAgent: XAgent, type: string) {
  const prompts: Record<string, string> = {
    comprehensive: `Review the code we've discussed for:
1. Bugs and logic errors
2. Security vulnerabilities
3. Performance issues
4. Code style and best practices
5. Potential improvements

For each issue, provide severity, location, description, and suggested fix.`,

    security: `Focus on security vulnerabilities:
- SQL injection
- XSS vulnerabilities
- Authentication issues
- Data exposure
- Input validation
- Dependency vulnerabilities`,

    performance: `Focus on performance issues:
- Inefficient algorithms
- Memory leaks
- Unnecessary computations
- Database query optimization
- Caching opportunities`,
  };

  console.log(`\n🔍 Running ${type} review...\n`);
  console.log("━".repeat(50));

  const stream = await xAgent.streamText({
    messages: [{ role: "user", content: prompts[type] }],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n" + "━".repeat(50));
}

async function generateSummary(xAgent: XAgent) {
  console.log("\n📊 Generating review summary...\n");

  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: `Generate a comprehensive code review summary including:
1. Overview of code reviewed
2. Summary of issues by severity
3. Key recommendations
4. Overall code quality assessment
5. Next steps`,
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
