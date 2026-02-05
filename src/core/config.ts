/**
 * Configuration types for Viber agents
 */

/**
 * Agent configuration - defines how an agent behaves
 */
export interface AgentConfig {
  id?: string;
  name: string;
  description: string;

  // Model settings (flat or nested)
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

  // Prompt configuration
  systemPrompt?: string;
  promptFile?: string;

  // Capabilities
  tools?: string[];
  skills?: string[];

  // Model parameters (when using flat config)
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;

  // Optional personality/behavior hints
  personality?: string;

  // Allow additional properties for extensibility
  [key: string]: any;
}

/**
 * Budget configuration for cost management
 */
export interface BudgetConfig {
  enabled: boolean;
  mode: "soft" | "hard";
  limitUsd?: number;
  warningThreshold?: number;
}

/**
 * Retry configuration for error handling
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoff: "linear" | "exponential" | "jittered";
}
