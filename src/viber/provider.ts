/**
 * AI Provider Management
 * Handles initialization and configuration of different AI providers
 *
 * Philosophy: Keep it simple - agents specify their provider and model explicitly.
 * Now using a Dynamic Provider Registry for improved extensibility.
 *
 * To add a new provider:
 * 1. Install the SDK.
 * 2. Call `ProviderRegistry.register("provider-name", (config) => ...)` somewhere in your app initialization.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ProviderRegistry } from "./registry";
import { ModelConfig, ModelProvider } from "./model-types";

// Re-export types for compatibility
export type { ModelConfig, ModelProvider };

// ============================================================================
// Register Default Providers
// ============================================================================

ProviderRegistry.register("anthropic", (config) => {
  return createAnthropic({
    apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    baseURL: config.baseURL || process.env.ANTHROPIC_BASE_URL,
    fetch: config.proxyFetch,
  });
});

ProviderRegistry.register("openai", (config) => {
  return createOpenAI({
    apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    baseURL: config.baseURL || process.env.OPENAI_BASE_URL,
    fetch: config.proxyFetch,
  });
});

ProviderRegistry.register("deepseek", (config) => {
  // Deepseek SDK might not accept config like OpenAI/Anthropic in the same way
  // if it's a pre-instantiated object, but we wrap it here.
  // Assuming 'deepseek' import is the provider instance itself or a factory.
  // Checking original code: "case 'deepseek': return deepseek;"
  // So it ignores config? That seems like a limitation of the original code or the SDK usage.
  // We'll return it as is for now.
  return deepseek;
});

ProviderRegistry.register("openrouter", (config) => {
  // Use the official OpenRouter SDK (v2.0.2+ for AI SDK 6 compatibility)
  const openrouterConfig: any = {
    apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
    fetch: config.proxyFetch,
  };

  // Use Helicone gateway for observability if configured
  if (process.env.HELICONE_API_KEY) {
    openrouterConfig.baseURL =
      config.baseURL || "https://openrouter.helicone.ai/api/v1";
    openrouterConfig.headers = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Property-User": config.userId || "anonymous",
      "Helicone-Property-Space": config.spaceId || "default",
    };
  }

  return createOpenRouter(openrouterConfig);
});

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the appropriate AI provider instance
 */
export function getModelProvider(config: ModelConfig) {
  return ProviderRegistry.get(config.provider, config);
}

/**
 * Check if a provider is properly configured
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
      return false; // Not yet implemented
    case "mistral":
      return false; // Not yet implemented
    case "cohere":
      return false; // Not yet implemented
    default:
      // Ideally check registry if it has a generic "isConfigured" check,
      // but for now default to false for unknown providers.
      return false;
  }
}

/**
 * Get list of configured providers
 */
export function getConfiguredProviders(): string[] {
  const providers = [
    "anthropic",
    "openai",
    "deepseek",
    "openrouter",
    "google",
    "mistral",
    "cohere",
  ];
  // We could also add dynamically registered providers here:
  // const dynamic = ProviderRegistry.list();
  // But we stick to the original behavior for now.
  return providers.filter(isProviderConfigured);
}

/**
 * Parse model string to extract provider and model name
 * Examples: "gpt-4o" -> { provider: "openai", modelName: "gpt-4o" }
 */
export function parseModelString(model: string): ModelConfig {
  // Viber models are handled differently - not through this parser
  // if (model.startsWith("viber-") || model === "viber") {
  //   return { provider: "viber", modelName: model };
  // }

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
