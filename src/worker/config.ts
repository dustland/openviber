/**
 * Configuration types for Viber agents and spaces
 */

// Re-export types
export type { SpaceConfig, SpaceState, SpaceModel, ViberConfig } from "../types";
import type { ViberConfig } from "../types";
import path from "path";
import os from "os";
import { getModuleDirname } from "../utils/module-path";
import fs from "fs/promises";
import * as yaml from "yaml";

export type { SupabaseClient } from "@supabase/supabase-js";



/**
 * OpenViber Runtime Configuration (storage paths, supabase factories, etc.)
 * Separate from ViberConfig which defines an individual viber's agent config.
 */
export interface RuntimeConfig {
  /** Root directory for file storage */
  storageRoot: string;

  /** Defaults directory path */
  defaultsPath?: string;

  /** Supabase client factories (optional for local mode) */
  createSupabaseClient?: () => any;
  createServiceRoleClient?: () => any;
}

/**
 * MCP Server Configuration
 */
export interface McpServerConfig {
  name: string;
  description?: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  require_approval?: string[];
}

/**
 * Global Configuration (config.yaml)
 */
export interface GlobalConfig {
  daemon?: any;
  defaults?: any;
  providers?: Record<string, any>;
  budget?: any;
  channels?: Record<string, any>;
  gateway?: any;
  security?: any;
  mcp_servers?: McpServerConfig[];
}

const __dirname = getModuleDirname();

let config: RuntimeConfig | null = null;

/**
 * Configure viber with application-specific settings
 */
export function configure(newConfig: RuntimeConfig): void {
  config = newConfig;
}

/**
 * Get current viber configuration
 */
export function getConfig(): RuntimeConfig {
  if (!config) {
    // Default configuration - use ~/.openviber for daemon mode
    return {
      storageRoot: path.join(os.homedir(), ".openviber"),
      defaultsPath: path.join(__dirname, "defaults"),
    };
  }
  return config;
}

/**
 * Get viber storage root path
 */
export function getViberRoot(): string {
  return getConfig().storageRoot;
}

/**
 * Get path relative to viber root
 */
export function getViberPath(...segments: string[]): string {
  const root = getViberRoot();
  return [root, ...segments].join("/");
}

/**
 * Load agent configuration from defaults
 */
export async function loadViberConfig(agentId: string): Promise<ViberConfig | null> {
  const defaultsPath = getConfig().defaultsPath || path.join(__dirname, "defaults");
  const agentPath = path.join(defaultsPath, "agents", `${agentId}.yaml`);

  try {
    const content = await fs.readFile(agentPath, "utf-8");
    const config = yaml.parse(content) as ViberConfig;
    return { ...config, id: agentId };
  } catch (error) {
    return null;
  }
}

/**
 * Load global configuration from ~/.openviber/config.yaml
 */
export async function loadGlobalConfig(): Promise<GlobalConfig | null> {
  const configPath = path.join(os.homedir(), ".openviber", "config.yaml");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return yaml.parse(content) as GlobalConfig;
  } catch (error) {
    // Return null if config doesn't exist or is invalid
    return null;
  }
}
