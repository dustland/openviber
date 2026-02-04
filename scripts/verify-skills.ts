#!/usr/bin/env node
/**
 * Verify tmux and cursor-agent skills: load registry, run tmux_install_check
 * and tmux_run with a trivial command. Optionally run cursor_agent_run (--cursor).
 *
 * Usage (from repo root):
 *   pnpm run verify:skills
 *   pnpm exec tsx scripts/verify-skills.ts --cursor   # also run Cursor agent (slow)
 *
 * Verify on the web (Viber Board):
 *   1. Start stack: pnpm dev  (hub + web + viber daemon)
 *   2. Open http://localhost:5173 (or your web URL) → Vibers
 *   3. Click your connected viber → you should see tmux and cursor-agent under "What you can ask"
 *   4. Send: "Check if tmux is installed" — the agent will use tmux_install_check and reply with version
 *   5. Or: "Run echo hello in tmux" — agent can use tmux_run to verify
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
    !skills.some((s) => s.id === "tmux") ||
    !skills.some((s) => s.id === "cursor-agent")
  ) {
    console.error("Expected tmux and cursor-agent skills to be loaded.");
    process.exit(1);
  }
  console.log("");

  // 2. Tmux: install check
  const tmuxTools = await defaultRegistry.getTools("tmux");
  const check = tmuxTools.tmux_install_check;
  if (!check) {
    console.error("tmux_install_check tool not found");
    process.exit(1);
  }
  const checkResult = await check.execute({});
  console.log("tmux_install_check:", JSON.stringify(checkResult, null, 2));
  if (!checkResult.installed) {
    console.error(
      "Tmux is not installed. Install with: brew install tmux (macOS) or sudo apt install tmux (Ubuntu)"
    );
    process.exit(1);
  }
  console.log("");

  // 3. Tmux: run a trivial command in tmux
  const tmuxRun = tmuxTools.tmux_run;
  if (!tmuxRun) {
    console.error("tmux_run tool not found");
    process.exit(1);
  }
  console.log("Running tmux_run with: echo 'Hello from tmux skill' ...");
  const tmuxResult = await tmuxRun.execute({
    sessionName: "viber-verify",
    command: "echo 'Hello from tmux skill'",
    waitSeconds: 2,
  });
  console.log("tmux_run result:", tmuxResult.ok ? "OK" : "FAILED");
  if (tmuxResult.ok && tmuxResult.output) {
    console.log("Captured output (last 5 lines):");
    const lines = String(tmuxResult.output).trim().split("\n").slice(-5);
    lines.forEach((l) => console.log("  ", l));
  } else if (!tmuxResult.ok) {
    console.error("Error:", tmuxResult.error);
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
