/**
 * Shared types for OpenViber framework
 */

export interface ViberError extends Error {
  code: string;
  details?: any;
}

export interface StreamChunk {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  content?: string;
  tool?: {
    name: string;
    args: any;
    result?: any;
  };
  error?: ViberError;
}

export interface ModelConfig {
  provider: "openai" | "anthropic" | "deepseek" | "openrouter" | "local";
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ViberConfig {
  model: ModelConfig;
  streaming?: boolean;
  debug?: boolean;
}

/**
 * Task result returned by the daemon
 */
export interface TaskResult {
  text: string;
  summary?: string;
  artifactRefs?: ArtifactRef[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd?: number;
  };
}

/**
 * Reference to an artifact (file, screenshot, log, etc.)
 */
export interface ArtifactRef {
  id: string;
  title?: string;
  type?: string; // "file" | "screenshot" | "log" | etc.
  ref?: string; // Path or URL
}

/**
 * Plan format (when sent as context)
 */
export interface PlanContext {
  format: "markdown" | "structured";
  content: string | StructuredPlan;
}

export interface StructuredPlan {
  goal: string;
  steps: Array<{
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed" | "blocked";
  }>;
}
