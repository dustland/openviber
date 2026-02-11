/**
 * Centralized OpenViber path resolution utility
 *
 * Handles the difference between local development and deployment:
 * - Local: ~/.openviber (os.homedir() + '.openviber')
 * - Railway/override: OPENVIBER_STORAGE_PATH environment variable
 */

import path from "path";
import os from "os";

/**
 * Get the root OpenViber directory path
 * Respects OPENVIBER_STORAGE_PATH environment variable
 */
export function getViberRoot(): string {
  return process.env.OPENVIBER_STORAGE_PATH || path.join(os.homedir(), ".openviber");
}

/**
 * Get a path within the OpenViber directory structure
 * @param subPath - Relative path within .openviber directory (e.g., 'vibers/default', 'skills/terminal')
 */
export function getViberPath(...subPaths: string[]): string {
  return path.join(getViberRoot(), ...subPaths);
}

/**
 * Get common OpenViber directory paths
 */
export const ViberPaths = {
  root: () => getViberRoot(),
  config: () => getViberPath("config"),
  spaces: () => getViberPath("spaces"),
  defaults: () => getViberPath("defaults"),
  playgrounds: () => getViberPath("playgrounds"),

  // MCP server organization
  mcpServers: () => getViberPath("mcp-servers"),
  mcpServerShared: () => getViberPath("mcp-servers", "shared"),

  // Specific paths
  vibers: () => getViberPath("vibers"),
  datasets: () => getViberPath("config", "datasets"),
  tools: () => getViberPath("config", "tools"),

  // MCP server paths - now using npm package
  officeMcpServer: () => "office-mcp", // npm package name
  officeMcpExecutable: () => "office-mcp", // npm package command

  // Default templates and configuration
  defaultsVibers: () => getViberPath("defaults", "vibers"),
  defaultsSpaces: () => getViberPath("defaults", "spaces"),

  // Space-specific paths
  space: (spaceId: string) => getViberPath("spaces", spaceId),
  spaceArtifacts: (spaceId: string) =>
    getViberPath("spaces", spaceId, "artifacts"),

  // Note: MCP servers are now distributed as npm packages, not local binaries
} as const;
