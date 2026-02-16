/**
 * Base classes and decorators for custom tools
 * Provides decorator-based tool extraction for multi-tool providers
 */

import { z } from "zod";
import * as path from "path";
import { promises as fs } from "fs";
import "reflect-metadata";
import { CoreTool } from "../worker/tool";
import { getViberRoot } from "../utils/paths";

const TOOLS_METADATA_KEY = Symbol("tools");

/**
 * Option definition for select fields
 * Contains semantic information about options (NOT UI concerns like icons)
 */
export interface OptionDefinition {
  value: string; // The actual value stored
  label: string; // Human-readable label
  description?: string; // Semantic description of what this option does
}

/**
 * Base configuration item - shared properties for all field types
 */
interface BaseConfigItem {
  name: string; // Human-readable field name
  description?: string; // What this field does/controls
  required?: boolean; // Whether this field is required
  defaultValue?: any; // Default value for the field
}

/**
 * String field configuration
 * Supports environment variable integration
 */
export interface StringConfigItem extends BaseConfigItem {
  type: "string";
  envVar?: string; // Environment variable name if applicable
}

/**
 * Number field configuration
 * Supports min/max validation
 */
export interface NumberConfigItem extends BaseConfigItem {
  type: "number";
  min?: number; // Minimum value
  max?: number; // Maximum value
}

/**
 * Boolean field configuration
 */
export interface BooleanConfigItem extends BaseConfigItem {
  type: "boolean";
}

/**
 * Select field configuration
 * Supports simple string options or rich option definitions
 */
export interface SelectConfigItem extends BaseConfigItem {
  type: "select";
  options: string[] | OptionDefinition[]; // Available choices
}

/**
 * Array field configuration
 */
export interface ArrayConfigItem extends BaseConfigItem {
  type: "array";
  itemType?: "string" | "number"; // Type of array items
}

/**
 * Configuration item - discriminated union of all field types
 * Each type has its own specific properties, ensuring type safety
 */
export type ConfigItem =
  | StringConfigItem
  | NumberConfigItem
  | BooleanConfigItem
  | SelectConfigItem
  | ArrayConfigItem;

/**
 * Tool configuration schema using ConfigItem
 */
export interface ConfigSchema {
  [key: string]: ConfigItem;
}

/**
 * Tool function decorator - marks a method as a tool with schema and description
 */
export function ToolFunction<T extends z.ZodSchema>(config: {
  name?: string; // Optional, defaults to method name
  description: string;
  input: T; // Input schema
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    // Store tool metadata
    const tools = Reflect.getMetadata(TOOLS_METADATA_KEY, target) || [];
    tools.push({
      methodName: propertyKey,
      toolName: config.name || propertyKey,
      description: config.description,
      inputSchema: config.input,
    });
    Reflect.defineMetadata(TOOLS_METADATA_KEY, tools, target);

    // Wrap the original method to validate input
    const originalMethod = descriptor.value;
    descriptor.value = async function (input: z.infer<T>) {
      // Validate input
      const validated = config.input.parse(input);
      // Call original method
      return originalMethod.call(this, validated);
    };

    return descriptor;
  };
}

// Shorter alias
export { ToolFunction as Function };

/**
 * Configuration schema for tools
 */
export interface ToolConfig {
  [key: string]: any;
}

/**
 * Tool metadata
 */
export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  requiresApiKey?: boolean;
  apiKeyName?: string;
}

/**
 * Base class for tools - a single class can provide multiple related tool methods
 *
 * Provides standardized space-aware file operations that automatically handle
 * Viber space storage structure (.viber/{spaceId}/artifacts/).
 *
 * Example usage in a custom tool:
 * ```typescript
 * class MyTool extends Tool {
 *   @ToolFunction({
 *     description: 'Process a file in the space',
 *     input: z.object({ fileName: z.string() })
 *   })
 *   async processFile(input: { fileName: string }) {
 *     // Check if file exists in space artifacts
 *     if (await this.artifactFileExists(input.fileName)) {
 *       // Read file content
 *       const content = await this.readArtifactFile(input.fileName);
 *
 *       // Process content...
 *       const processed = content.toUpperCase();
 *
 *       // Write back to artifacts
 *       await this.writeArtifactFile('processed_' + input.fileName, processed);
 *
 *       return { success: true };
 *     }
 *     throw new Error('File not found in space artifacts');
 *   }
 * }
 * ```
 */
export abstract class Tool {
  protected spaceId?: string;

  /**
   * Get tool metadata
   */
  abstract getMetadata(): ToolMetadata;

  /**
   * Get configuration schema for this tool
   * Returns null if no configuration needed
   */
  getConfigSchema(): ConfigSchema | null {
    return null;
  }

  /**
   * Validate configuration
   */
  validateConfig(config: any): boolean {
    const schema = this.getConfigSchema();
    if (!schema) return true;

    // Basic validation based on ConfigSchema
    for (const [key, item] of Object.entries(schema)) {
      const value = config[key];

      // Check required fields
      if (
        item.required &&
        (value === undefined || value === null || value === "")
      ) {
        return false;
      }

      // Type validation
      if (value !== undefined && value !== null) {
        switch (item.type) {
          case "number": {
            if (typeof value !== "number") return false;
            // TypeScript knows item is NumberConfigItem here
            if (item.min !== undefined && value < item.min) return false;
            if (item.max !== undefined && value > item.max) return false;
            break;
          }
          case "boolean":
            if (typeof value !== "boolean") return false;
            break;
          case "select": {
            // TypeScript knows item is SelectConfigItem here
            // Handle both string[] and OptionDefinition[]
            const validValues = item.options.map((opt) =>
              typeof opt === "string" ? opt : opt.value
            );
            if (!validValues.includes(value)) return false;
            break;
          }
          case "array":
            if (!Array.isArray(value)) return false;
            break;
        }
      }
    }

    return true;
  }

  /**
   * Get current configuration
   */
  getConfig(): ToolConfig | null {
    return null;
  }

  /**
   * Set configuration
   */
  setConfig(config: ToolConfig): void {
    // Override in subclasses if needed
    // The config parameter is intentionally unused in the base class
    void config;
  }

  /**
   * Set space context for this tool instance
   * Called by the tool system when spaceId is available
   */
  setSpaceId(spaceId?: string): void {
    this.spaceId = spaceId;
  }

  /**
   * Get the current space ID
   */
  getSpaceId(): string | undefined {
    return this.spaceId;
  }

  /**
   * Get space-aware storage path
   * Utility method for tools that need to work with space-specific storage
   */
  protected async getSpacePathAsync(subPath: string = ""): Promise<string> {
    return this.getSpacePath(subPath);
  }

  private static getRootPath(): string {
    return getViberRoot();
  }

  protected getSpacePath(subPath: string = ""): string {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }
    // Use the exact same root path logic as SpaceStore
    const rootPath = Tool.getRootPath();
    const basePath = path.join(rootPath, "spaces", this.spaceId);
    return subPath ? path.join(basePath, subPath) : basePath;
  }

  /**
   * Get space artifacts directory path
   * Utility method for tools that work with space artifacts
   */
  protected getSpaceArtifactsPath(fileName: string = ""): string {
    const artifactsPath = this.getSpacePath("artifacts");
    return fileName ? path.join(artifactsPath, fileName) : artifactsPath;
  }

  /**
   * Resolve file path within space artifacts directory
   * Handles both relative and absolute paths, with security checks
   */
  protected resolveArtifactPath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      // For absolute paths, check if they're within the space artifacts directory
      const artifactsPath = this.getSpaceArtifactsPath();
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(artifactsPath)) {
        throw new Error(
          "Absolute paths outside space artifacts directory are not allowed"
        );
      }
      return resolved;
    }
    // For relative paths, resolve within artifacts directory
    return this.getSpaceArtifactsPath(filePath);
  }

  /**
   * Read file from space artifacts directory
   */
  protected async readArtifactFile(
    filePath: string,
    encoding: BufferEncoding = "utf8"
  ): Promise<string> {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }

    // Normalize path - remove "artifacts/" prefix if present
    const normalizedPath = filePath.startsWith("artifacts/")
      ? filePath.substring(10)
      : filePath;
    const fullPath = this.getSpaceArtifactsPath(normalizedPath);

    return await fs.readFile(fullPath, encoding);
  }

  /**
   * Write file to space artifacts directory
   */
  protected async writeArtifactFile(
    filePath: string,
    content: string,
    encoding: BufferEncoding = "utf8"
  ): Promise<void> {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }

    // Normalize path - remove "artifacts/" prefix if present
    const normalizedPath = filePath.startsWith("artifacts/")
      ? filePath.substring(10)
      : filePath;
    const fullPath = this.getSpaceArtifactsPath(normalizedPath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, encoding);
  }

  /**
   * Check if file exists in space artifacts directory
   */
  protected async artifactFileExists(filename: string): Promise<boolean> {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }
    try {
      const fullPath = this.getSpaceArtifactsPath(filename);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats from space artifacts directory
   * Note: This method still uses fs.stat for local storage compatibility
   * For Supabase storage, size info is available through artifact metadata
   */
  protected async getArtifactFileStats(filePath: string) {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }

    // For local storage, we can still use fs.stat on the resolved path
    // This is acceptable since getArtifactFileStats is primarily used for
    // file metadata that's already available through other means in Supabase
    const fullPath = this.resolveArtifactPath(filePath);
    return await fs.stat(fullPath);
  }

  /**
   * List files in space artifacts directory
   */
  protected async listArtifactFiles(
    dirPath: string = "",
    recursive: boolean = false
  ): Promise<string[]> {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }

    // Normalize directory path
    const normalizedPath = dirPath.startsWith("artifacts/")
      ? dirPath.substring(10)
      : dirPath;
    const fullPath = this.getSpaceArtifactsPath(normalizedPath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      if (!recursive) {
        return entries.filter(e => e.isFile()).map(e => e.name);
      }
      // Recursive listing
      const files: string[] = [];
      const walk = async (dir: string, prefix: string) => {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.isFile()) {
            files.push(itemPath);
          } else if (item.isDirectory()) {
            await walk(path.join(dir, item.name), itemPath);
          }
        }
      };
      await walk(fullPath, "");
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Delete file from space artifacts directory
   */
  protected async deleteArtifactFile(filePath: string): Promise<void> {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }

    // Normalize path
    const normalizedPath = filePath.startsWith("artifacts/")
      ? filePath.substring(10)
      : filePath;
    const fullPath = this.getSpaceArtifactsPath(normalizedPath);

    await fs.unlink(fullPath);
  }

  /**
   * Copy file within space artifacts directory
   */
  protected async copyArtifactFile(
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }

    // Normalize paths
    const normalizedSource = sourcePath.startsWith("artifacts/")
      ? sourcePath.substring(10)
      : sourcePath;
    const normalizedDest = destPath.startsWith("artifacts/")
      ? destPath.substring(10)
      : destPath;

    const srcFullPath = this.getSpaceArtifactsPath(normalizedSource);
    const destFullPath = this.getSpaceArtifactsPath(normalizedDest);

    // Ensure destination directory exists
    await fs.mkdir(path.dirname(destFullPath), { recursive: true });
    await fs.copyFile(srcFullPath, destFullPath);
  }

  /**
   * Move file within space artifacts directory
   */
  protected async moveArtifactFile(
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    if (!this.spaceId) {
      throw new Error(
        "Space ID not set. This tool requires space context."
      );
    }

    // Normalize paths
    const normalizedSource = sourcePath.startsWith("artifacts/")
      ? sourcePath.substring(10)
      : sourcePath;
    const normalizedDest = destPath.startsWith("artifacts/")
      ? destPath.substring(10)
      : destPath;

    const srcFullPath = this.getSpaceArtifactsPath(normalizedSource);
    const destFullPath = this.getSpaceArtifactsPath(normalizedDest);

    // Ensure destination directory exists
    await fs.mkdir(path.dirname(destFullPath), { recursive: true });
    await fs.rename(srcFullPath, destFullPath);
  }

  /**
   * Check if tool is available/properly configured
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Automatically extract all decorated methods as tools
   */
  getTools(): Record<string, CoreTool> {
    const tools: Record<string, CoreTool> = {};

    // Get all decorated tool methods
    const toolMetadata = Reflect.getMetadata(TOOLS_METADATA_KEY, this) || [];

    for (const {
      methodName,
      toolName,
      description,
      inputSchema,
    } of toolMetadata) {
      // Create CoreTool entry - tool names should already be in snake_case
      tools[toolName] = {
        description,
        inputSchema: inputSchema || z.any(),
        execute: (this as any)[methodName].bind(this),
      };
    }

    return tools;
  }

  /**
   * Get list of tool names provided by this class
   */
  getToolNames(): string[] {
    const toolMetadata = Reflect.getMetadata(TOOLS_METADATA_KEY, this) || [];
    return toolMetadata.map((t: any) => t.toolName);
  }

  /**
   * Get detailed information about all tool functions
   * Returns the same structure as getTools() but without execute functions
   */
  getToolDetails(): Array<{
    name: string;
    description: string;
    parameters: any;
  }> {
    const tools = this.getTools();
    return Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.inputSchema?._def || tool.inputSchema || {},
    }));
  }
}
