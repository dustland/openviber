/**
 * Shared types for Viber engine
 */

export interface ViberError extends Error {
  code: string;
  details?: any;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  tool?: {
    name: string;
    args: any;
    result?: any;
  };
  error?: ViberError;
}

export interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'local';
  model: string;
  temperature?: number;
  maxTokens?: number;
}



// ============================================================================
// Space Types
// ============================================================================

/**
 * Space configuration - defines what the space is and how it works
 */
export interface SpaceConfig {
  name: string;
  description?: string;
  icon?: string;
  agents?: string[];
  agentPool?: string[];
  tools?: string[];
  datasets?: string[]; // Knowledge bases/document collections
  quickMessages?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

/**
 * Internal persistence format - what Viber saves to disk
 */
export interface SpaceModel {
  spaceId: string;
  name: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  teamAgents: string[];
  plan?: any;
  artifacts?: any[];
}

/**
 * Running space status - exposed to UI layer
 * Shows real-time progress and task information
 */
export interface SpaceState {
  spaceId: string;
  name: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  teamSize: number;
  tasks?: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    failed: number;
  };
  progressPercentage?: number;
}

// ============================================================================
// Entity Types (Migrated from src/storage/types.ts)
// ============================================================================

export interface AgentData {
  id: string;
  userId?: string; // Owner of this agent
  name: string;
  description: string;
  category?: string;
  icon?: string;
  logoUrl?: string;
  tags?: string[];
  systemPrompt?: string;
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
  tools?: string[];
  author?: string;
  version?: string;
  usageExamples?: string[];
  requirements?: string[];
  createdAt?: string;
  updatedAt?: string;
  isCustom?: boolean; // Added field found in usage
}

export interface ToolData {
  id: string;
  userId?: string; // Owner of this tool
  name: string;
  description: string;
  type: "builtin" | "mcp" | "custom";
  vendor?: string;
  category?: string;
  icon?: string;
  logoUrl?: string;
  config?: Record<string, any>;
  configSchema?: any[];
  features?: string[];
  tags?: string[];
  status?: "active" | "inactive" | "deprecated";
  ready?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SpaceData {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  goal?: string;
  config?: Record<string, any>;
  teamConfig?: any;
  activeArtifactId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArtifactData {
  id: string;
  spaceId?: string;
  taskId?: string;
  userId?: string;
  category?: "input" | "intermediate" | "output";
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationData {
  id: string;
  spaceId?: string;
  userId?: string;
  title?: string;
  messages?: any[];
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskData {
  id: string;
  spaceId?: string;
  userId?: string;
  title?: string;
  description?: string;
  status?: "pending" | "active" | "completed" | "failed";
  result?: any;
  metadata?: Record<string, any>;
  model?: string;
  mode?: string;
  systemMessage?: string;
  messages?: any[];
  supervision?: any;
  context?: any;
  createdAt?: string;
  updatedAt?: string;
}

// Renaming ModelConfig from storage to ProviderModelConfig to avoid conflict
export interface ProviderModelConfig {
  id: string;
  name: string;
}

export interface ModelProviderData {
  id: string;
  name: string;
  provider: string;
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  models?: string[] | ProviderModelConfig[];
  config?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface DatasourceData {
  id: string;
  name: string;
  type: string;
  config?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Configuration for creating/initializing a Viber
 */
export interface ViberConfig {
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
  promptFile?: string;
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
  metadata?: Record<string, any>;
  mode?: "always_ask" | "agent_decides" | "always_execute" | "always-ask" | "agent-decides" | "viber_decides" | "viber-decides" | "always-execute";
  workingMode?: "always_ask" | "agent_decides" | "always_execute" | "always-ask" | "agent-decides" | "viber_decides" | "viber-decides" | "always-execute";
  requireApproval?: string[];
  require_approval?: string[];
  [key: string]: any;
}
