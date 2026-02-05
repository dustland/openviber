/**
 * Base classes and decorators for custom tools
 * Provides decorator-based tool extraction for multi-tool providers
 */

import { z } from "zod";
import * as path from "path";
import { promises as fs } from "fs";
import "reflect-metadata";
import { CoreTool } from "../core/tool";
import { getViberRoot } from "../config";

const TOOLS_METADATA_KEY = Symbol("tools");

/**
 * Option definition for select fields
 */
export interface OptionDefinition {
  value: string;
  label: string;
  description?: string;
}

/**
 * Base configuration item
 */
interface BaseConfigItem {
  name: string;
  description?: string;
  required?: boolean;
  defaultValue?: any;
}

export interface StringConfigItem extends BaseConfigItem {
  type: "string";
  envVar?: string;
}

export interface NumberConfigItem extends BaseConfigItem {
  type: "number";
  min?: number;
  max?: number;
}

export interface BooleanConfigItem extends BaseConfigItem {
  type: "boolean";
}

export interface SelectConfigItem extends BaseConfigItem {
  type: "select";
  options: string[] | OptionDefinition[];
}

export interface ArrayConfigItem extends BaseConfigItem {
  type: "array";
  itemType?: "string" | "number";
}

export type ConfigItem =
  | StringConfigItem
  | NumberConfigItem
  | BooleanConfigItem
  | SelectConfigItem
  | ArrayConfigItem;

export interface ConfigSchema {
  [key: string]: ConfigItem;
}

/**
 * Tool function decorator
 */
export function ToolFunction<T extends z.ZodSchema>(config: {
  name?: string;
  description: string;
  input: T;
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const tools = Reflect.getMetadata(TOOLS_METADATA_KEY, target) || [];
    tools.push({
      methodName: propertyKey,
      toolName: config.name || propertyKey,
      description: config.description,
      inputSchema: config.input,
    });
    Reflect.defineMetadata(TOOLS_METADATA_KEY, tools, target);

    const originalMethod = descriptor.value;
    descriptor.value = async function (input: z.infer<T>) {
      const validated = config.input.parse(input);
      return originalMethod.call(this, validated);
    };

    return descriptor;
  };
}

export { ToolFunction as Function };

export interface ToolConfig {
  [key: string]: any;
}

export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  requiresApiKey?: boolean;
  apiKeyName?: string;
}

/**
 * Base class for tools
 *
 * Tools operate on the local filesystem directly. The daemon is stateless
 * and does not manage space storage.
 */
export abstract class Tool {
  /**
   * Get tool metadata
   */
  abstract getMetadata(): ToolMetadata;

  /**
   * Get configuration schema
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

    for (const [key, item] of Object.entries(schema)) {
      const value = config[key];

      if (
        item.required &&
        (value === undefined || value === null || value === "")
      ) {
        return false;
      }

      if (value !== undefined && value !== null) {
        switch (item.type) {
          case "number": {
            if (typeof value !== "number") return false;
            if (item.min !== undefined && value < item.min) return false;
            if (item.max !== undefined && value > item.max) return false;
            break;
          }
          case "boolean":
            if (typeof value !== "boolean") return false;
            break;
          case "select": {
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
  setConfig(_config: ToolConfig): void {
    // Override in subclasses
  }

  /**
   * Check if tool is available
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Get all decorated methods as tools
   */
  getTools(): Record<string, CoreTool> {
    const tools: Record<string, CoreTool> = {};

    const toolMetadata = Reflect.getMetadata(TOOLS_METADATA_KEY, this) || [];

    for (const {
      methodName,
      toolName,
      description,
      inputSchema,
    } of toolMetadata) {
      tools[toolName] = {
        description,
        inputSchema: inputSchema || z.any(),
        execute: (this as any)[methodName].bind(this),
      };
    }

    return tools;
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    const toolMetadata = Reflect.getMetadata(TOOLS_METADATA_KEY, this) || [];
    return toolMetadata.map((t: any) => t.toolName);
  }

  /**
   * Get detailed tool info
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
