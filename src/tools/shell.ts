/**
 * Secure Shell Tool
 * Provides controlled shell execution with sandboxing and timeout
 */

import { z } from "zod";
import { exec } from "child_process";
import {
  Tool,
  ToolFunction,
  ToolMetadata,
  ToolConfig,
  ConfigSchema,
} from "./base";
import { SecurityGuard } from "../utils/security";

export class ShellTool extends Tool {
  private config: ToolConfig = {
    timeoutMs: 30000, // 30 seconds default
    restrictToWorkspace: true,
  };
  private security: SecurityGuard;

  constructor() {
    super();
    this.security = new SecurityGuard(process.cwd());
  }

  getMetadata(): ToolMetadata {
    return {
      id: "shell",
      name: "Shell Executor",
      description: "Execute shell commands securely within the workspace",
      category: "system",
    };
  }

  getConfigSchema(): ConfigSchema {
    return {
      timeoutMs: {
        name: "Timeout (ms)",
        type: "number",
        description: "Maximum execution time in milliseconds",
        defaultValue: 30000,
        required: false,
      },
      restrictToWorkspace: {
        name: "Restrict to Workspace",
        type: "boolean",
        description: "Enforce workspace path restrictions",
        defaultValue: true,
        required: false,
      },
    };
  }

  getConfig(): ToolConfig {
    return this.config;
  }

  setConfig(config: ToolConfig): void {
    this.config = { ...this.config, ...config };
  }

  @ToolFunction({
    description: "Execute a shell command. Use this to run CLI tools, scripts, or system commands.",
    input: z.object({
      command: z.string().describe("The shell command to execute"),
      cwd: z.string().optional().describe("Working directory for execution (defaults to workspace root)"),
      timeout: z.number().optional().describe("Timeout in milliseconds (overrides config)"),
    }),
  })
  async shell_run(input: { command: string; cwd?: string; timeout?: number }) {
    // 1. Security Check: Command Patterns
    this.security.validateCommand(input.command);

    // 2. Security Check: CWD Sandboxing
    // Resolve cwd against workspace root (process.cwd() for now)
    const targetCwd = input.cwd || process.cwd();
    
    // If we have a spaceId, we might want to target the space root?
    // For now, let's stick to the simple SecurityGuard logic which uses the process root.
    // In a real multi-tenant setup, we'd update SecurityGuard with the specific space root.
    if (this.config.restrictToWorkspace) {
      this.security.validatePath(targetCwd);
    }

    const timeout = input.timeout || this.config.timeoutMs;

    return new Promise((resolve, reject) => {
      exec(
        input.command,
        {
          cwd: targetCwd,
          timeout: timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
        (error, stdout, stderr) => {
          if (error) {
            // Return error result instead of throwing, so the agent sees the failure
            return resolve({
              ok: false,
              command: input.command,
              exitCode: error.code || 1,
              stdout: stdout.trim(),
              stderr: stderr.trim() || error.message,
            });
          }

          resolve({
            ok: true,
            command: input.command,
            exitCode: 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        }
      );
    });
  }
}
