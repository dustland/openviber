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

export interface StorageConfig {
  type: 'local' | 'supabase';
  basePath?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface ViberConfig {
  storage: StorageConfig;
  model: ModelConfig;
  streaming?: boolean;
  debug?: boolean;
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
