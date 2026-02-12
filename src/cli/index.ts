#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";

import { program } from "commander";
import * as path from "path";
import { VERSION } from "./common";
import { shouldRunInteractiveLauncher, runInteractiveLauncher } from "./launcher";

// Commands
import { startCommand } from "./commands/start";
import { gatewayCommand, boardCommand, hubCommand } from "./commands/gateway";
import { runCommand } from "./commands/run";
import { chatCommand } from "./commands/chat";
import { termCommand } from "./commands/term";
import { authCommand, loginCommand } from "./commands/auth";
import { statusCommand } from "./commands/status";
import { onboardCommand } from "./commands/onboard";
import { skillCommand } from "./commands/skill";
import { channelsCommand } from "./commands/channels";

function getCliName(): string {
  const invokedPath = process.argv[1];
  const invokedName = invokedPath ? path.parse(invokedPath).name : "";
  if (invokedName === "viber" || invokedName === "openviber") return invokedName;
  return "openviber";
}

program
  .name(getCliName())
  .description("OpenViber - Workspace-first assistant runtime (tasks on your Viber)")
  .version(VERSION);

program.addCommand(startCommand);
program.addCommand(gatewayCommand);
program.addCommand(boardCommand); // deprecated alias
program.addCommand(hubCommand); // deprecated alias
program.addCommand(runCommand);
program.addCommand(chatCommand);
program.addCommand(termCommand);
program.addCommand(loginCommand);
program.addCommand(authCommand);
program.addCommand(statusCommand);
program.addCommand(onboardCommand);
program.addCommand(skillCommand);
program.addCommand(channelsCommand);

async function main(): Promise<void> {
  if (shouldRunInteractiveLauncher()) {
    await runInteractiveLauncher();
    return;
  }
  await program.parseAsync();
}

void main();
