/**
 * Core types for AI Model Providers
 */

export type ModelProvider = string;

export interface ModelConfig {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  baseURL?: string;
  /** Optional proxy-aware fetch to route API calls through an HTTP proxy */
  proxyFetch?: typeof fetch;

  // Context/Usage tracking
  spaceId?: string;
  userId?: string;
  storageRoot?: string;
  teamConfig?: string;
  defaultGoal?: string;
}

export interface ModelProviderFactory {
  (config: ModelConfig): any; // Returns an AI SDK LanguageModel
}
