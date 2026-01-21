/**
 * Centralized Viber path resolution utility
 *
 * Handles the difference between local development and Railway deployment:
 * - Local: ~/.viber (os.homedir() + '.viber')
 * - Railway: /viber (VIBEX_STORAGE_PATH environment variable)
 */

import path from "path";
import os from "os";

/**
 * Get the root Viber directory path
 * Respects VIBEX_STORAGE_PATH environment variable for Railway deployment
 */
export function getViberRoot(): string {
  return process.env.VIBEX_STORAGE_PATH || path.join(os.homedir(), ".viber");
}

/**
 * Get a path within the Viber directory structure
 * @param subPath - Relative path within .viber directory (e.g., 'config/agents', 'bin/OfficeMcp')
 */
export function getViberPath(...subPaths: string[]): string {
  return path.join(getViberRoot(), ...subPaths);
}

/**
 * Get common Viber directory paths
 */
export const ViberPaths = {
  root: () => getViberRoot(),
  config: () => getViberPath("config"),
  spaces: () => getViberPath("spaces"),
  defaults: () => getViberPath("defaults"),

  // MCP server organization
  mcpServers: () => getViberPath("mcp-servers"),
  mcpServerShared: () => getViberPath("mcp-servers", "shared"),

  // Specific paths
  agents: () => getViberPath("agents"),
  datasets: () => getViberPath("config", "datasets"),
  tools: () => getViberPath("config", "tools"),

  // MCP server paths - now using npm package
  officeMcpServer: () => "office-mcp", // npm package name
  officeMcpExecutable: () => "office-mcp", // npm package command

  // Default templates and configuration
  defaultsAgents: () => getViberPath("defaults", "agents"),
  defaultsSpaces: () => getViberPath("defaults", "spaces"),

  // Space-specific paths
  space: (spaceId: string) => getViberPath("spaces", spaceId),
  spaceArtifacts: (spaceId: string) =>
    getViberPath("spaces", spaceId, "artifacts"),

  // Note: MCP servers are now distributed as npm packages, not local binaries
} as const;

