import { z } from "zod";
import type { CoreTool } from "../../worker/tool";

export function getTools(): Record<string, CoreTool> {
  return {
    test_echo: {
      description:
        "Echo the provided message back unchanged. For integration testing.",
      inputSchema: z.object({
        message: z.string().describe("The message to echo back"),
      }),
      execute: async (args: { message: string }) => {
        return {
          echo: args.message,
          timestamp: new Date().toISOString(),
        };
      },
    },
  };
}
