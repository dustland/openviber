import { Command } from "commander";

export const runCommand = new Command("run")
  .argument("<goal>", "Goal to achieve")
  .description("Run a task locally (thin daemon runtime, no Space)")
  .option("-m, --model <model>", "LLM model to use", "deepseek/deepseek-chat")
  .option("-a, --agent <agent>", "Agent config to use", "default")
  .action(async (goal, options) => {
    // Load API keys from ~/.openviber/.env (does not override existing env vars)
    const { loadOpenViberEnv } = await import("../auth");
    await loadOpenViberEnv();

    const { registerDefaultSkills } = await import("../../skills");
    registerDefaultSkills();

    const { runTask } = await import("../../daemon/runtime");

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
