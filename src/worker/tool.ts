/**
 * Tool System for Viber
 *
 * Coordinates between custom tools and MCP tools.
 * Knows nothing about specific tool implementations.
 */

import { z } from "zod";
import { loadGlobalConfig } from "./config";
import { createMcpClient } from "./mcp-client";

// Core tool interface that AI SDK expects
export interface CoreTool {
  description: string;
  inputSchema: z.ZodSchema | any;
  execute: (args: any, context?: any) => Promise<any>;
}

// Cache for MCP clients
const mcpClients = new Map<string, any>();

/** Progress callback for tools to emit intermediate updates */
export type ToolProgressCallback = (event: {
  kind: string;
  phase?: string;
  message?: string;
  data?: any;
}) => void;

/** Context passed through to tool execution */
export interface ToolContext {
  spaceId?: string;
  oauthTokens?: {
    google?: { accessToken: string; refreshToken?: string | null };
    [provider: string]: { accessToken: string; refreshToken?: string | null } | undefined;
  };
  /** Optional progress callback for tools to emit intermediate updates */
  onProgress?: ToolProgressCallback;
}

/**
 * Build a tool map for streamText from an array of tool IDs
 * Delegates to appropriate providers without knowing their internals
 */
export async function buildToolMap(
  toolIds: string[],
  context?: ToolContext
): Promise<Record<string, CoreTool>> {
  const tools: Record<string, CoreTool> = {};

  // Load MCP server configurations to determine tool types
  // dataStore usage removed - simplified for now
  const globalConfig = await loadGlobalConfig();
  const mcpServers: any[] = globalConfig?.mcp_servers?.map((s) => ({ ...s, id: s.name })) || [];
  const mcpServerIds = new Set(mcpServers.map((s: any) => s.id));

  // Separate custom tools and MCP tools
  const customToolIds: string[] = [];
  const mcpToolIds: string[] = [];

  for (const id of toolIds) {
    // Check if it's an MCP server ID
    if (mcpServerIds.has(id)) {
      mcpToolIds.push(id);
    } else {
      customToolIds.push(id);
    }
  }

  // Load custom tools if needed
  if (customToolIds.length > 0) {
    const { buildToolMap: buildCustomToolMap } = await import("../tools");
    const customTools = buildCustomToolMap(customToolIds, context);
    Object.assign(tools, customTools);
  }

  // Load MCP tools if needed
  if (mcpToolIds.length > 0) {
    const mcpTools = await loadMcpTools(mcpToolIds);
    Object.assign(tools, mcpTools);
  }

  return tools;
}

/**
 * Load MCP tools by ID
 * This is the only part that knows about MCP specifics
 */
async function loadMcpTools(ids: string[]): Promise<Record<string, CoreTool>> {
  const tools: Record<string, CoreTool> = {};

  // Group by server for efficient loading
  const serverGroups = new Map<string, string[]>();
  for (const id of ids) {
    // Handle both mcp:serverId format and direct serverId format
    let serverId = id;
    if (id.startsWith("mcp:")) {
      const parts = id.split(":");
      serverId = parts[1] || id;
    }

    if (!serverGroups.has(serverId)) {
      serverGroups.set(serverId, []);
    }
    serverGroups.get(serverId)!.push(id);
  }

  // Load each server's tools
  for (const [serverId, toolIds] of serverGroups) {
    try {
      let mcpClient = mcpClients.get(serverId);

      if (!mcpClient) {
        // Load config
        const globalConfig = await loadGlobalConfig();
        const mcpConfig = globalConfig?.mcp_servers?.find((s) => s.name === serverId);

        if (!mcpConfig) {
          console.error(`[Tools] MCP server '${serverId}' not found in configuration.`);
          continue;
        }

        try {
          // Initialize MCP Client
          mcpClient = await createMcpClient(mcpConfig);
          mcpClients.set(serverId, mcpClient);
        } catch (error) {
           console.error(`[Tools] Failed to create/connect MCP client for ${serverId}:`, error);
           continue;
        }
      }

      // Extract tools from the MCP client
      if (mcpClient) {
        // Get all tools from the MCP client
        // SDK: client.listTools() returns { tools: Tool[] }
        const result = await mcpClient.listTools();
        const mcpToolsList = result.tools || [];

        // Map to CoreTool format
        for (const tool of mcpToolsList) {
           const toolName = tool.name;

           // Convert MCP tool to CoreTool
           tools[toolName] = {
             description: tool.description || "",
             inputSchema: tool.inputSchema,
             execute: async (args: any) => {
               // Execute tool via MCP client
               // SDK: client.callTool({ name, arguments })
               const result = await mcpClient.callTool({
                 name: toolName,
                 arguments: args,
               });

               // Result format: { content: ... }
               // If there is an error, SDK might throw or return isError: true
               if (result.isError) {
                  throw new Error(`Tool execution failed: ${JSON.stringify(result.content)}`);
               }
               return result.content;
             }
           };
        }
      }
    } catch (error) {
      console.error(`[Tools] Failed to load tools from MCP server ${serverId}:`, error);
    }
  }

  return tools;
}

/**
 * Check if an object is a valid tool
 */
export function isValidTool(obj: any): boolean {
  return !!(
    obj &&
    typeof obj === "object" &&
    typeof obj.execute === "function" &&
    typeof obj.description === "string"
  );
}

/**
 * Clear MCP cache (useful for testing)
 */
export function clearToolCache(): void {
  mcpClients.clear();
}
