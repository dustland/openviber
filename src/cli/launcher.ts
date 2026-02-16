import * as readline from "readline";
import { isInteractiveTerminal, question, runSubcommand } from "./common";
import { gatewayGetVibers } from "./gateway-client";

export function shouldRunInteractiveLauncher(): boolean {
  if (process.env.OPENVIBER_NO_LAUNCHER === "1") return false;
  return process.argv.slice(2).length === 0 && isInteractiveTerminal();
}

export async function runInteractiveLauncher(): Promise<void> {
  const gatewayUrl =
    process.env.VIBER_GATEWAY_URL ||
    process.env.VIBER_BOARD_URL ||
    process.env.VIBER_HUB_URL ||
    "http://localhost:6009";

  const vibers = await gatewayGetVibers(gatewayUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  type LauncherAction =
    | "chat"
    | "status"
    | "onboard"
    | "start"
    | "run"
    | "exit";

  let action: LauncherAction = "exit";
  let runGoal = "";

  try {
    console.log("\nOpenViber — chat-first launcher\n");

    if (vibers.connected && vibers.vibers.length > 0) {
      const preview = vibers.vibers
        .slice(0, 3)
        .map((v, i) => `  ${i + 1}. ${v.name} (${v.id})`)
        .join("\n");
      console.log(`Connected vibers (${vibers.vibers.length}):`);
      console.log(preview);
      if (vibers.vibers.length > 3) {
        console.log(`  ...and ${vibers.vibers.length - 3} more`);
      }
      console.log("");
      console.log("Choose next step:");
      console.log("  1) Jump into chat");
      console.log("  2) Check status");
      console.log("  3) Run onboarding setup");
      console.log("  4) Exit\n");

      const answer = (await question(rl, "Select [1-4] (Enter for 1): "))
        .trim()
        .toLowerCase();

      if (answer === "" || answer === "1" || answer === "chat") action = "chat";
      else if (answer === "2" || answer === "status") action = "status";
      else if (answer === "3" || answer === "onboard") action = "onboard";
      else action = "exit";
    } else {
      console.log("No connected vibers detected.\n");
      console.log("Choose next step:");
      console.log("  1) Run onboarding setup");
      console.log("  2) Start local daemon");
      console.log("  3) Run a one-off task");
      console.log("  4) Exit\n");

      const answer = (await question(rl, "Select [1-4] (Enter for 1): "))
        .trim()
        .toLowerCase();

      if (answer === "" || answer === "1" || answer === "onboard") {
        action = "onboard";
      } else if (answer === "2" || answer === "start") {
        action = "start";
      } else if (answer === "3" || answer === "run") {
        action = "run";
        runGoal = (await question(rl, "Task goal: ")).trim();
      } else {
        action = "exit";
      }
    }
  } finally {
    rl.close();
  }

  if (action === "exit") return;

  if (action === "chat") {
    process.exit(await runSubcommand(["chat", "--gateway", gatewayUrl]));
  } else if (action === "status") {
    process.exit(await runSubcommand(["status", "--gateway", gatewayUrl]));
  } else if (action === "onboard") {
    process.exit(await runSubcommand(["onboard"]));
  } else if (action === "start") {
    process.exit(await runSubcommand(["start"]));
  } else if (action === "run") {
    if (!runGoal) {
      console.log("No task goal provided. Exiting.");
      return;
    }
    process.exit(await runSubcommand(["run", runGoal]));
  }
}
