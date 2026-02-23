import { Command } from "commander";
import * as readline from "readline";
import { findRepoRoot, getMissingRequiredVars, resolveEnvironment } from "../../environment";
import { question } from "../common";

export const runCommand = new Command("run")
  .argument("[goal]", "Goal to achieve (optional, omit for interactive mode)")
  .description("Run a task locally (thin daemon runtime, no Space)")
  .option("-m, --model <model>", "LLM model to use", "deepseek/deepseek-chat")
  .option("-a, --agent <agent>", "Agent config to use", "default")
  .option("--env <envId>", "Environment ID override")
  .action(async (goal, options) => {
    // Load API keys from ~/.openviber/.env (does not override existing env vars)
    const { loadOpenViberEnv } = await import("../auth");
    await loadOpenViberEnv();

    const repoRoot = findRepoRoot(process.cwd());
    if (repoRoot) {
      const environment = await resolveEnvironment(repoRoot, options.env);
      if (environment) {
        const missing = getMissingRequiredVars(environment);
        if (missing.length > 0) {
          console.error(`[env] Missing required vars: ${missing.join(", ")}`);
          console.error("[env] Set values with: openviber env set KEY=VALUE");
          process.exit(1);
        }

        process.env.OPENVIBER_ENV_ID = environment.envId;
      }
    }

    const { registerSkillTools } = await import("../../tools/skill-tools");
    registerSkillTools();

    const { runTask } = await import("../../daemon/runtime");

    // Interactive Mode
    if (!goal) {
      console.log(`[Viber] Interactive mode (Agent: ${options.agent}, Model: ${options.model})`);
      console.log("Type your message and press Enter. Type /exit or /quit to leave.\n");

      const messages: { role: string; content: string }[] = [];
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      // Cleanup on exit
      const cleanup = () => {
        try { rl.close(); } catch {}
      };
      process.on("SIGINT", () => {
        cleanup();
        process.exit(0);
      });

      try {
        while (true) {
          const line = await question(rl, "you> ");
          const input = line.trim();
          if (!input) continue;

          if (input === "/exit" || input === "/quit" || input === "exit" || input === "quit") {
            break;
          }

          messages.push({ role: "user", content: input });
          process.stdout.write("viber> ");

          try {
            const { streamResult } = await runTask(input, {
              taskId: `run-${Date.now()}`,
              model: options.model,
              singleAgentId: options.agent,
            }, messages);

            let fullResponse = "";
            for await (const chunk of streamResult.fullStream) {
              if (chunk.type === "text-delta") {
                const text = (chunk as any).text ?? (chunk as any).textDelta;
                if (text) {
                  process.stdout.write(text);
                  fullResponse += text;
                }
              }
            }
            process.stdout.write("\n");
            messages.push({ role: "assistant", content: fullResponse });

          } catch (error: any) {
            console.error(`\n[Viber] Error: ${error.message}`);
          }
        }
      } finally {
        cleanup();
      }
      return;
    }

    // Single-shot Mode
    console.log(`[Viber] Running task: ${goal}`);

    try {
      const { streamResult } = await runTask(goal, {
        taskId: `run-${Date.now()}`,
        model: options.model,
        singleAgentId: options.agent,
      });

      for await (const chunk of streamResult.fullStream) {
        if (chunk.type === "text-delta") {
          const text = (chunk as any).text ?? (chunk as any).textDelta;
          if (text) process.stdout.write(text);
        }
      }

      console.log("\n\n[Viber] Task completed");
    } catch (error: any) {
      console.error("[Viber] Task failed:", error.message);
      process.exit(1);
    }
  });
