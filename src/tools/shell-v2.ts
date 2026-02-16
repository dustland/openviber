/**
 * ShellTool - New implementation using Tool trait
 *
 * This is the new version that implements the Tool interface
 * The old version in shell.ts is deprecated
 */

import { z } from "zod";
import {
  Tool,
  ToolResult,
  ToolContext,
  ToolSpec,
  BaseTool,
  DEFAULT_SECURITY_POLICY,
  RuntimeAdapter,
} from "../worker/tool-trait";

const inputSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  cwd: z.string().optional().describe("Working directory for execution"),
  timeout: z.number().optional().describe("Timeout in milliseconds (overrides security policy)"),
});

export type ShellInput = z.infer<typeof inputSchema>;

/**
 * ShellTool - executes shell commands with security policy enforcement
 */
export class ShellTool extends BaseTool {
  spec(): ToolSpec {
    return {
      name: "shell",
      description: "Execute shell commands. Use this to run CLI tools, scripts, or system commands.",
      parameters: {
        type: "object",
        description: "Shell command input",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          cwd: {
            type: "string",
            description: "Working directory for execution",
          },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds",
          },
        },
        required: ["command"],
      },
      category: "system",
      requiresApproval: false,
    };
  }

  async executeImpl(params: unknown, context: ToolContext): Promise<ToolResult> {
    const validated = this.validateParams(params, inputSchema);
    if (!validated.success) {
      return {
        success: false,
        output: "",
        error: (validated as { success: false; error: string }).error,
      };
    }

    const { command, cwd, timeout } = validated.data;

    // Apply security policy
    const security = { ...DEFAULT_SECURITY_POLICY, ...context.security };

    // Security check: blocked commands
    for (const pattern of security.blockedCommands) {
      if (pattern.test(command)) {
        return {
          success: false,
          output: "",
          error: `Command blocked by security policy: ${pattern}`,
        };
      }
    }

    // Security check: allowed commands (if whitelist is active)
    if (security.allowedCommands.length > 0) {
      const isAllowed = security.allowedCommands.some((pattern) => pattern.test(command.split(" ")[0]));
      if (!isAllowed) {
        return {
          success: false,
          output: "",
          error: `Command not in allowlist. Use shell for: ${security.allowedCommands.map((p) => p.source).join(", ")}`,
        };
      }
    }

    // Execute via runtime adapter
    const result = await context.runtime.exec(command, {
      cwd: cwd || process.cwd(),
      timeout: timeout || security.timeoutMs,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        output: result.stdout,
        error: result.stderr || `Command failed with exit code ${result.exitCode}`,
      };
    }

    return {
      success: true,
      output: result.stdout,
      data: {
        exitCode: result.exitCode,
        stderr: result.stderr,
      },
    };
  }
}

/**
 * Create a CoreTool wrapper for AI SDK compatibility
 */
export function createShellCoreTool(): import("../worker/tool").CoreTool {
  const shellTool = new ShellTool();
  const spec = shellTool.getSpec();

  return {
    description: spec.description,
    inputSchema: spec.parameters as any,
    execute: async (args: any, context?: any) => {
      const toolContext: ToolContext = {
        security: DEFAULT_SECURITY_POLICY,
        runtime: new (await import("../worker/tool-trait")).NativeRuntime(),
        spaceId: context?.spaceId,
        userId: context?.userId,
        oauthTokens: context?.oauthTokens,
        onProgress: context?.onProgress,
        requestId: context?.requestId,
      };

      const result = await shellTool.execute(args, toolContext);
      if (result.success) {
        return result.output;
      }
      throw new Error(result.error || "Tool execution failed");
    },
  };
}
