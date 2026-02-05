/**
 * Data types for Viber entities
 * Moved from lib/data/types.ts to make Viber the single source of truth
 */

export interface Agent {
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
}

export interface Tool {
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

export interface Space {
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

export interface Artifact {
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

export interface Conversation {
  id: string;
  spaceId?: string;
  userId?: string;
  title?: string;
  messages?: any[];
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
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

export interface ModelConfig {
  id: string;
  name: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  provider: string; // Should this be provider type? Or same as id?
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  models?: string[] | ModelConfig[]; // Legacy uses string[], new uses ModelConfig[]
  config?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Datasource {
  id: string;
  name: string;
  type: string;
  config?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}
