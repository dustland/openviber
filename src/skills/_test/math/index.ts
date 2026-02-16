import { z } from "zod";
import type { CoreTool } from "../../../viber/tool";

export function getTools(): Record<string, CoreTool> {
  return {
    test_calculate: {
      description:
        "Perform basic arithmetic on two numbers. For integration testing.",
      inputSchema: z.object({
        a: z.number().describe("First operand"),
        b: z.number().describe("Second operand"),
        op: z
          .enum(["add", "subtract", "multiply", "divide"])
          .describe("Arithmetic operation"),
      }),
      execute: async (args: { a: number; b: number; op: string }) => {
        const { a, b, op } = args;
        let result: number;
        let expression: string;

        switch (op) {
          case "add":
            result = a + b;
            expression = `${a} + ${b} = ${result}`;
            break;
          case "subtract":
            result = a - b;
            expression = `${a} - ${b} = ${result}`;
            break;
          case "multiply":
            result = a * b;
            expression = `${a} × ${b} = ${result}`;
            break;
          case "divide":
            if (b === 0) {
              return { error: "Division by zero", expression: `${a} / 0` };
            }
            result = a / b;
            expression = `${a} ÷ ${b} = ${result}`;
            break;
          default:
            return { error: `Unknown operation: ${op}` };
        }

        return { result, expression };
      },
    },
  };
}
