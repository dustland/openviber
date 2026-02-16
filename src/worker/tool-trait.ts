/**
 * Tool Trait - Standard interface for all tools
 * Inspired by ZeroClaw's Tool trait
 *
 * All tools must implement this interface to ensure:
 * - Consistent execution context
 * - Security policy awareness
 * - Runtime isolation support
 */

import { z } from "zod";

/**
 * ToolResult - standardized return type for all tools
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}

/**
 * ToolSpec - metadata about a tool
 */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JSONSchema;
  category?: string;
  requiresApproval?: boolean;
}

/**
 * JSONSchema type for tool parameters
 */
export type JSONSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  anyOf?: JSONSchema[];
  [key: string]: unknown;
};

/**
 * SecurityPolicy - defines security constraints for tool execution
 */
export interface SecurityPolicy {
  /** Maximum execution time in milliseconds */
  timeoutMs: number;
  /** Whether to restrict file access to workspace */
  restrictToWorkspace: boolean;
  /** Commands that are explicitly blocked */
  blockedCommands: RegExp[];
  /** Commands that are explicitly allowed */
  allowedCommands: RegExp[];
  /** Maximum output size in bytes */
  maxOutputSize: number;
  /** Whether tool requires user approval */
  requiresApproval: boolean;
}

/**
 * Default security policy - conservative defaults
 */
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  timeoutMs: 30000, // 30 seconds
  restrictToWorkspace: true,
  blockedCommands: [
    /\brm\s+(-r|-f|-rf|-fr)\s+(\/|(\.|\.\.|\*)(\/)?(\s|$))/, // rm -rf /, ., .., *
    /\bmkfs/, // format disk
    /\bdd\b/, // low-level copy
    /\bchown\b/, // change ownership
    /\bchmod\b.*777/, // dangerous permissions
    /:(){:|:&};:/, // fork bomb
    /\bsudo\b/, // privilege escalation
  ],
  allowedCommands: [
    /\bls\b/,
    /\bcat\b/,
    /\bhead\b/,
    /\btail\b/,
    /\bgrep\b/,
    /\bfind\b/,
    /\bgit\b/,
    /\bnpm\b/,
    /\byarn\b/,
    /\bpnpm\b/,
    /\bcargo\b/,
  ],
  maxOutputSize: 10 * 1024 * 1024, // 10MB
  requiresApproval: false,
};

/**
 * RuntimeAdapter - abstraction for execution environment
 * Allows tools to run in different contexts (native, docker, etc.)
 */
export interface RuntimeAdapter {
  /** Execute a command in the runtime */
  exec(command: string, options: {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  }): Promise<{ stdout: string; stderr: string; exitCode: number | null }>;

  /** Check if a file exists */
  fileExists(path: string): Promise<boolean>;

  /** Read a file */
  readFile(path: string): Promise<string>;

  /** Write a file */
  writeFile(path: string, content: string): Promise<void>;

  /** Get the runtime type */
  runtime: "native" | "docker" | "sandbox";
}

/**
 * NativeRuntime - runs commands directly on the host
 */
export class NativeRuntime implements RuntimeAdapter {
  runtime = "native" as const;

  async exec(command: string, options: {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  }): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const { exec } = await import("child_process");
    return new Promise((resolve, reject) => {
      exec(
        command,
        {
          cwd: options.cwd,
          timeout: options.timeout || 30000,
          env: options.env ? { ...process.env, ...options.env } : undefined,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              stdout: stdout || "",
              stderr: stderr || error.message,
              exitCode: (error as any).code || 1,
            });
          } else {
            resolve({
              stdout: stdout || "",
              stderr: stderr || "",
              exitCode: 0,
            });
          }
        }
      );
    });
  }

  async fileExists(path: string): Promise<boolean> {
    const { access } = await import("fs/promises");
    return access(path).then(() => true).catch(() => false);
  }

  async readFile(path: string): Promise<string> {
    const { readFile } = await import("fs/promises");
    return readFile(path, "utf8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    const { writeFile, mkdir } = await import("fs/promises");
    const dir = path.substring(0, path.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    return writeFile(path, content, "utf8");
  }
}

/**
 * ToolContext - passed to all tool executions
 * Provides security, runtime, and metadata
 */
export interface ToolContext {
  /** Security policy for this execution */
  security: SecurityPolicy;
  /** Runtime adapter for execution */
  runtime: RuntimeAdapter;
  /** Space ID for multi-tenancy */
  spaceId?: string;
  /** User ID for tracking */
  userId?: string;
  /** OAuth tokens for external services */
  oauthTokens?: {
    google?: { accessToken: string; refreshToken?: string | null };
    [provider: string]: { accessToken: string; refreshToken?: string | null } | undefined;
  };
  /** Progress callback for streaming updates */
  onProgress?: (event: {
    kind: string;
    phase?: string;
    message?: string;
    data?: unknown;
  }) => void;
  /** Request ID for tracing */
  requestId?: string;
}

/**
 * Tool - unified interface for all tools
 * All tools must implement this interface
 */
export interface Tool {
  /** Get tool metadata */
  getSpec(): ToolSpec;

  /** Execute the tool with given parameters */
  execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}

/**
 * BaseTool - convenient base class for tools
 * Provides common functionality and handles conversion between formats
 */
export abstract class BaseTool implements Tool {
  /** Subclasses implement this to define the tool */
  abstract spec(): ToolSpec;

  /** Subclasses implement this to execute */
  abstract executeImpl(params: unknown, context: ToolContext): Promise<ToolResult>;

  getSpec(): ToolSpec {
    return this.spec();
  }

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    // Apply security policy before execution
    const security = { ...DEFAULT_SECURITY_POLICY, ...context.security };

    // Check approval requirement
    if (security.requiresApproval && !this.hasApproval(context)) {
      return {
        success: false,
        output: "",
        error: `Tool '${this.getSpec().name}' requires explicit approval. Use metadata.approvedTools to approve.`,
      };
    }

    // Execute with timeout
    return Promise.race([
      this.executeImpl(params, { ...context, security }),
      new Promise<ToolResult>((resolve) =>
        setTimeout(
          () =>
            resolve({
              success: false,
              output: "",
              error: `Tool execution timeout (${security.timeoutMs}ms)`,
            }),
          security.timeoutMs
        )
      ),
    ]);
  }

  private hasApproval(context: ToolContext): boolean {
    // Check if this tool is in the approved list
    // This would be passed in metadata from the agent
    return false; // Default to no approval
  }

  /**
   * Helper to validate parameters against a schema
   */
  protected validateParams<T extends z.ZodSchema>(
    params: unknown,
    schema: T
  ): { success: true; data: z.infer<T> } | { success: false; error: string } {
    const result = schema.safeParse(params);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      error: `Invalid parameters: ${result.error.errors.map((e) => e.message).join(", ")}`,
    };
  }
}

/**
 * Create a CoreTool from a Tool (for AI SDK compatibility)
 */
export function toolToCoreTool(tool: Tool): import("./tool").CoreTool {
  const spec = tool.getSpec();
  return {
    description: spec.description,
    inputSchema: spec.parameters as any,
    execute: async (args: any, context?: any) => {
      const toolContext: ToolContext = {
        security: DEFAULT_SECURITY_POLICY,
        runtime: new NativeRuntime(),
        spaceId: context?.spaceId,
        userId: context?.userId,
        oauthTokens: context?.oauthTokens,
        onProgress: context?.onProgress,
        requestId: context?.requestId,
      };
      const result = await tool.execute(args, toolContext);
      if (result.success) {
        return result.output;
      }
      throw new Error(result.error || "Tool execution failed");
    },
  };
}
