#!/usr/bin/env node
/**
 * Verify terminal and cursor-agent skills: load registry, run terminal_check
 * and terminal_run with a trivial command. Optionally run cursor_agent_run (--cursor).
 *
 * Usage (from repo root):
 *   pnpm run verify:skills
 *   pnpm exec tsx scripts/verify-skills.ts --cursor   # also run Cursor agent (slow)
 *
 * Verify on the web (Viber Board):
 *   1. Start stack: pnpm dev  (hub + web + viber daemon)
 *   2. Open http://localhost:5173 (or your web URL) → Vibers
 *   3. Click your connected viber → you should see terminal and cursor-agent under "What you can ask"
 *   4. Send: "Check terminal status" — the agent will use terminal_check and reply with version
 *   5. Or: "Run echo hello in a terminal" — agent can use terminal_run to verify
 */

import { defaultRegistry } from "../src/skills/registry";
// Trigger pre-registration of skill tools
import "../src/skills";

async function main() {
  const runCursor = process.argv.includes("--cursor");

  console.log("=== Viber skills verification ===\n");

  // 1. Load all skills from SKILL.md
  await defaultRegistry.loadAll();
  const skills = defaultRegistry.getAllSkills();
  console.log("Loaded skills:", skills.map((s) => s.id).join(", "));
  if (
    !skills.some((s) => s.id === "terminal") ||
    !skills.some((s) => s.id === "cursor-agent")
  ) {
    console.error("Expected terminal and cursor-agent skills to be loaded.");
    process.exit(1);
  }
  console.log("");

  // 2. Terminal: health check
  const terminalTools = await defaultRegistry.getTools("terminal");
  const check = terminalTools.terminal_check;
  if (!check) {
    console.error("terminal_check tool not found");
    process.exit(1);
  }
  const checkResult = await check.execute({});
  console.log("terminal_check:", JSON.stringify(checkResult, null, 2));
  if (!checkResult.available) {
    console.error(
      "Terminal backend not available. Install tmux: brew install tmux (macOS) or sudo apt install tmux (Ubuntu)"
    );
    process.exit(1);
  }
  console.log("");

  // 3. Terminal: run a trivial command
  const terminalRun = terminalTools.terminal_run;
  if (!terminalRun) {
    console.error("terminal_run tool not found");
    process.exit(1);
  }
  console.log("Running terminal_run with: echo 'Hello from terminal skill' ...");
  const runResult = await terminalRun.execute({
    sessionName: "viber-verify",
    command: "echo 'Hello from terminal skill'",
    waitSeconds: 2,
  });
  console.log("terminal_run result:", runResult.ok ? "OK" : "FAILED");
  if (runResult.ok && runResult.output) {
    console.log("Captured output (last 5 lines):");
    const lines = String(runResult.output).trim().split("\n").slice(-5);
    lines.forEach((l) => console.log("  ", l));
  } else if (!runResult.ok) {
    console.error("Error:", runResult.error);
    process.exit(1);
  }
  console.log("");

  // 4. Cursor-agent: tool exists (optional: run it)
  const cursorTools = await defaultRegistry.getTools("cursor-agent");
  const cursorRun = cursorTools.cursor_agent_run;
  if (!cursorRun) {
    console.error("cursor_agent_run tool not found");
    process.exit(1);
  }
  console.log("cursor-agent skill: cursor_agent_run tool is available.");

  if (runCursor) {
    console.log(
      "\nRunning cursor_agent_run with goal 'Reply with exactly: OK' (wait 20s) ..."
    );
    const cursorResult = await cursorRun.execute({
      goal: "Reply with exactly: OK",
      waitSeconds: 20,
    });
    console.log("cursor_agent_run result:", cursorResult.ok ? "OK" : "FAILED");
    if (cursorResult.ok && cursorResult.output) {
      console.log("Captured output (last 10 lines):");
      const lines = String(cursorResult.output).trim().split("\n").slice(-10);
      lines.forEach((l) => console.log("  ", l));
    } else if (!cursorResult.ok) {
      console.error("Error:", cursorResult.error);
    }
  } else {
    console.log(
      "To also run the Cursor agent (slow), use: pnpm exec tsx scripts/verify-skills.ts --cursor"
    );
  }

  console.log("\n=== Verification complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
