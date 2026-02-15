export type ModelProvider = string;

export interface ModelConfig {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  baseURL?: string;
  /** Optional proxy-aware fetch to route API calls through an HTTP proxy */
  proxyFetch?: typeof fetch;
  // Viber-specific options
  spaceId?: string;
  userId?: string; // For usage tracking (e.g., Helicone)
  storageRoot?: string;
  teamConfig?: string;
  defaultGoal?: string;
}
