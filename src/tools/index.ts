/**
 * Tools Registry
 *
 * Dynamic tool discovery and management system.
 * Tools are discovered from tool classes using decorators.
 */

import { CoreTool } from "../core/tool";
import { Tool } from "./base";

// Import all tools
import { FileTool } from "./file";
import { SearchTool } from "./search";
import { WebTool } from "./web";
import { BrowserTool } from "./browser";
import { DesktopTool } from "./desktop";

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  tags?: string[];
  features?: string[];
  tools: string[];
  functions?: any[];
  functionDetails?: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
  configSchema?: any;
  enabled?: boolean;
}

// Tool instances (created on demand)
const toolInstances = new Map<string, Tool>();

// Available tool classes
const toolClasses = new Map<string, new () => Tool>([
  ["file", FileTool],
  ["search", SearchTool],
  ["web", WebTool],
  ["browser", BrowserTool],
  ["desktop", DesktopTool],
]);

/**
 * Get or create a tool instance
 */
export function getToolInstance(toolId: string): Tool | null {
  if (!toolInstances.has(toolId)) {
    const ToolClass = toolClasses.get(toolId);
    if (!ToolClass) return null;

    try {
      const instance = new ToolClass();

      if (!instance.isAvailable()) {
        console.warn(`[getToolInstance] Tool ${toolId} is not available`);
        return null;
      }

      toolInstances.set(toolId, instance);
    } catch (error) {
      console.warn(`[Tools] Failed to initialize tool ${toolId}:`, error);
      return null;
    }
  }
  return toolInstances.get(toolId) || null;
}

// Static function details for server-side rendering
const staticFunctionDetails = {
  file: [
    {
      name: "createFile",
      description: "Create a new file or overwrite an existing file",
      parameters: {},
    },
    {
      name: "readFile",
      description: "Read the contents of a file",
      parameters: {},
    },
    {
      name: "deleteFile",
      description: "Delete a file from the file system",
      parameters: {},
    },
    {
      name: "listFiles",
      description: "List all files in a directory",
      parameters: {},
    },
    {
      name: "moveFile",
      description: "Move or rename a file",
      parameters: {},
    },
    {
      name: "copyFile",
      description: "Copy a file from one location to another",
      parameters: {},
    },
    {
      name: "fileExists",
      description: "Check if a file or directory exists",
      parameters: {},
    },
  ],
  search: [
    {
      name: "search",
      description: "Search the web for information",
      parameters: {},
    },
  ],
  web: [
    {
      name: "fetchWebpage",
      description: "Extract and parse web page content",
      parameters: {},
    },
    {
      name: "crawlWebsite",
      description: "Crawl a website to extract content from multiple pages",
      parameters: {},
    },
    {
      name: "checkUrl",
      description: "Check if a URL is accessible",
      parameters: {},
    },
  ],
};

/**
 * Get all tools info
 */
export function getToolProviders(): ToolInfo[] {
  if (typeof window === "undefined") {
    // Server-side: return static metadata
    const tools: ToolInfo[] = [
      {
        id: "file",
        name: "File System Tools",
        description: "Read, write, and manage files",
        category: "file",
        icon: "FolderOpen",
        tags: ["Files", "Storage", "Local"],
        tools: ["createFile", "readFile", "deleteFile", "listFiles", "moveFile", "copyFile", "fileExists"],
        functions: ["createFile", "readFile", "deleteFile", "listFiles", "moveFile", "copyFile", "fileExists"],
        functionDetails: staticFunctionDetails.file,
        enabled: true,
      },
      {
        id: "search",
        name: "Web Search",
        description: "Search the web for information",
        category: "search",
        icon: "Search",
        tags: ["Search", "Web", "Research"],
        tools: ["search"],
        functions: ["search"],
        functionDetails: staticFunctionDetails.search,
        enabled: true,
      },
      {
        id: "web",
        name: "Web Tools",
        description: "Extract web content and crawl websites",
        category: "web",
        icon: "Globe",
        tags: ["Web", "Extraction", "Crawling"],
        tools: ["fetchWebpage", "crawlWebsite", "checkUrl"],
        functions: ["fetchWebpage", "crawlWebsite", "checkUrl"],
        functionDetails: staticFunctionDetails.web,
        enabled: true,
      },
    ];
    return tools;
  }

  // Client-side: instantiate tools
  const tools: ToolInfo[] = [];

  for (const [id, ToolClass] of toolClasses) {
    try {
      const instance = new ToolClass();
      const metadata = instance.getMetadata();

      if (instance.isAvailable()) {
        const tags =
          id === "file" ? ["Files", "Storage", "Local"] :
          id === "search" ? ["Search", "Web", "Research"] :
          id === "web" ? ["Web", "Extraction", "Crawling"] : [];

        tools.push({
          ...metadata,
          tags,
          tools: instance.getToolNames(),
          functions: instance.getToolNames(),
          functionDetails: instance.getToolDetails(),
          configSchema: instance.getConfigSchema(),
          enabled: true,
        });
      }
    } catch (error) {
      console.warn(`[Tools] Failed to get metadata for tool ${id}:`, error);
    }
  }

  return tools;
}

/**
 * Get a specific tool info
 */
export function getToolProvider(toolId: string): ToolInfo | null {
  const ToolClass = toolClasses.get(toolId);
  if (!ToolClass) return null;

  try {
    const instance = new ToolClass();
    const metadata = instance.getMetadata();

    const tags =
      toolId === "file" ? ["Files", "Storage", "Local"] :
      toolId === "search" ? ["Search", "Web", "Research"] :
      toolId === "web" ? ["Web", "Extraction", "Crawling"] : [];

    return {
      ...metadata,
      tags,
      tools: instance.getToolNames(),
      functions: instance.getToolNames(),
      functionDetails: instance.getToolDetails(),
      configSchema: instance.getConfigSchema(),
      enabled: instance.isAvailable(),
    };
  } catch (error) {
    console.warn(`[Tools] Failed to get metadata for tool ${toolId}:`, error);
    return null;
  }
}

/**
 * Build a tool map for specific tool IDs
 */
export function buildToolMap(
  toolIds: string[],
  _context?: { spaceId?: string }
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};

  for (const toolId of toolIds) {
    // Check if this is a tool class ID
    if (toolClasses.has(toolId)) {
      const tool = getToolInstance(toolId);
      if (tool) {
        const toolFunctions = tool.getTools();
        Object.assign(tools, toolFunctions);
        continue;
      }
    }

    // Try to find it as a specific function
    let found = false;

    for (const [id] of toolClasses) {
      const tool = getToolInstance(id);
      if (!tool) continue;

      const toolFunctions = tool.getTools();

      if (toolId in toolFunctions) {
        tools[toolId] = toolFunctions[toolId];
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn(`[Tools] Tool not found: ${toolId}`);
    }
  }

  return tools;
}

/**
 * Get all available tool IDs
 */
export function getAllToolIds(): string[] {
  const ids: string[] = [];

  for (const [toolId] of toolClasses) {
    const tool = getToolInstance(toolId);
    if (!tool) continue;

    const toolFunctions = tool.getTools();
    ids.push(...Object.keys(toolFunctions));
  }

  return ids;
}

/**
 * Check if a tool ID is available
 */
export function isToolAvailable(toolId: string): boolean {
  for (const [id] of toolClasses) {
    const tool = getToolInstance(id);
    if (!tool) continue;

    const toolFunctions = tool.getTools();
    if (toolId in toolFunctions) {
      return true;
    }
  }

  return false;
}

// Backward compatibility
export function getAvailableTools(): string[] {
  return getAllToolIds();
}

export type ToolProviderInfo = ToolInfo;
