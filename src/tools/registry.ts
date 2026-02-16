import { CoreTool } from "../worker/tool";
import { createLogger } from "../utils/logger";

const log = createLogger("ToolRegistry");

/**
 * ToolRegistry — manages CoreTool objects that give the agent executable capabilities.
 *
 * Tools are separate from Skills (which are instruction packages).
 * Tools provide the agent's built-in capabilities: terminal access,
 * file operations, API calls, etc.
 *
 * Skills (SKILL.md) tell the agent HOW and WHEN to use these tools.
 */
export class ToolRegistry {
  private tools: Map<string, Record<string, CoreTool>> = new Map();

  /**
   * Register tools under a namespace (e.g. "terminal", "github").
   * Tools can be registered at startup and are available to all agents.
   */
  registerTools(namespace: string, tools: Record<string, CoreTool>): void {
    this.tools.set(namespace, tools);
    const toolNames = Object.keys(tools);
    log.info(`Registered ${toolNames.length} tools under '${namespace}'`, {
      data: { tools: toolNames },
    });
  }

  /**
   * Get tools registered under a specific namespace.
   */
  getTools(namespace: string): Record<string, CoreTool> {
    return this.tools.get(namespace) || {};
  }

  /**
   * Get all registered tools across all namespaces, flattened into one record.
   */
  getAllTools(): Record<string, CoreTool> {
    const all: Record<string, CoreTool> = {};
    for (const tools of this.tools.values()) {
      Object.assign(all, tools);
    }
    return all;
  }

  /**
   * Get tools for specific namespaces, flattened into one record.
   */
  getToolsFor(namespaces: string[]): Record<string, CoreTool> {
    const result: Record<string, CoreTool> = {};
    for (const ns of namespaces) {
      const tools = this.tools.get(ns);
      if (tools) {
        Object.assign(result, tools);
      }
    }
    return result;
  }

  /**
   * Check if a namespace has registered tools.
   */
  hasTools(namespace: string): boolean {
    return this.tools.has(namespace);
  }

  /**
   * Get all registered namespaces.
   */
  getNamespaces(): string[] {
    return Array.from(this.tools.keys());
  }
}

/** Global tool registry instance */
export const defaultToolRegistry = new ToolRegistry();
