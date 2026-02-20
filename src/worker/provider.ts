/**
 * AI Provider Management
 * Handles initialization and configuration of different AI providers
 *
 * Refactored to use dynamic ProviderRegistry for extensibility.
 */

import { defaultProviderRegistry } from "../viber/provider";
import { ModelConfig, ModelProvider } from "../viber/model-types";

// Re-export types for backward compatibility
export type { ModelConfig, ModelProvider };

/**
 * Get the appropriate AI provider instance
 * Delegates to the global ProviderRegistry
 */
export function getModelProvider(config: ModelConfig) {
  return defaultProviderRegistry.get(config);
}

/**
 * Check if a provider is properly configured
 * Note: This checks environment variables for known default providers.
 * Custom providers might handle their own validation.
 */
export function isProviderConfigured(provider: string): boolean {
  switch (provider) {
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "deepseek":
      return !!process.env.DEEPSEEK_API_KEY;
    case "openrouter":
      return !!process.env.OPENROUTER_API_KEY;
    case "google":
      return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    default:
      // For unknown providers, we assume they are configured or don't need env vars
      // Ideally, the registry would have a `validate()` method.
      return defaultProviderRegistry.has(provider);
  }
}

/**
 * Get list of configured providers
 */
export function getConfiguredProviders(): string[] {
  // Start with the list from registry
  const available = defaultProviderRegistry.list();

  // Filter by configuration status
  return available.filter(isProviderConfigured);
}

/**
 * Parse model string to extract provider and model name
 * Examples: "gpt-4o" -> { provider: "openai", modelName: "gpt-4o" }
 */
export function parseModelString(model: string): ModelConfig {
  // Anthropic models (direct access)
  if (model.startsWith("claude-")) {
    return { provider: "anthropic", modelName: model };
  }

  // Deepseek models (direct access)
  if (model.startsWith("deepseek-")) {
    return { provider: "deepseek", modelName: model };
  }

  // Models with "/" are OpenRouter format (e.g., "deepseek/deepseek-chat", "openai/gpt-4o-mini")
  // OpenRouter API expects upstream provider/model only — never prefix with "openrouter/"
  if (model.includes("/")) {
    const modelName = model.startsWith("openrouter/")
      ? model.slice("openrouter/".length)
      : model;
    return { provider: "openrouter", modelName };
  }

  // Simple model names default to OpenAI (e.g., "gpt-4o", "gpt-4o-mini")
  return { provider: "openai", modelName: model };
}

/**
 * Get context limit for a model
 */
export function getModelContextLimit(modelName: string): number {
  const contextLimits: Record<string, number> = {
    // Viber (uses underlying model limits dynamically)
    viber: 100000,
    "viber-default": 100000,

    // Deepseek
    "deepseek-chat": 65536,
    "deepseek-reasoner": 65536,

    // OpenRouter models
    "anthropic/claude-3.5-sonnet": 150000,
    "anthropic/claude-3.5-haiku": 150000,
    "openai/gpt-4o": 100000,
    "openai/o1-preview": 100000,
    "google/gemini-2.0-flash-exp:free": 100000,
    "meta-llama/llama-3.3-70b-instruct": 32000,

    // Anthropic
    "claude-3-5-sonnet-20240620": 150000,
    "claude-3-haiku-20240307": 150000,
    "claude-3-opus-20240229": 150000,

    // OpenAI
    "gpt-4o": 100000,
    "gpt-4o-mini": 100000,
    "gpt-4-turbo": 100000,
    "gpt-3.5-turbo": 16000,
  };

  return contextLimits[modelName] || 50000; // Default to 50k
}

/**
 * Get completion token reservation for a model
 */
export function getCompletionTokens(modelName: string): number {
  if (modelName.startsWith("deepseek-reasoner")) {
    return 32000; // Deepseek reasoner needs more tokens
  }
  if (modelName.startsWith("deepseek-")) {
    return 8000;
  }
  return 4000; // Default for most models
}
