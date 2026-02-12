/**
 * Configuration types for Viber agents and spaces
 */

// Re-export types but avoid ModelConfig conflict
export type { SpaceConfig, SpaceState, SpaceModel } from "../types";
import path from "path";
import os from "os";
import fs from "fs/promises";
import * as yaml from "yaml";

export type { SupabaseClient } from "@supabase/supabase-js";

// Re-export AgentConfig if it exists elsewhere, otherwise define it here
export interface AgentConfig {
  id?: string;
  name: string;
  description: string;
  provider?: string;
  model?: string;
  llm?: {
    provider: string;
    model: string;
    settings?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
    };
  };
  systemPrompt?: string;
  tools?: string[];
  skills?: string[];
  /** Primary coding CLI skill id (from settings); agent prefers it for coding tasks when set. */
  primaryCodingCli?: string | null;
  personality?: string;
  temperature?: number;
  maxTokens?: number;
  /** Maximum number of multi-step tool-call rounds (default: 10) */
  maxSteps?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  promptFile?: string; // Optional prompt file path
  mode?: "always_ask" | "agent_decides" | "always_execute";
  workingMode?:
  | "always_ask"
  | "agent_decides"
  | "viber_decides"
  | "always_execute"
  | "always-ask"
  | "agent-decides"
  | "viber-decides"
  | "always-execute";
  require_approval?: string[];
  requireApproval?: string[];
  [key: string]: any; // Allow additional properties
}

/**
 * OpenViber Runtime Configuration
 */
export interface ViberConfig {
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
  command: string;
  args?: string[];
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

let config: ViberConfig | null = null;

/**
 * Configure viber with application-specific settings
 */
export function configure(newConfig: ViberConfig): void {
  config = newConfig;
}

/**
 * Get current viber configuration
 */
export function getConfig(): ViberConfig {
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
export async function loadAgentConfig(agentId: string): Promise<AgentConfig | null> {
  const defaultsPath = getConfig().defaultsPath || path.join(__dirname, "defaults");
  const agentPath = path.join(defaultsPath, "agents", `${agentId}.yaml`);

  try {
    const content = await fs.readFile(agentPath, "utf-8");
    const config = yaml.parse(content) as AgentConfig;
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
