import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ProviderRegistry } from "./registry";
import { ModelConfig } from "./model-types";

export const defaultProviderRegistry = new ProviderRegistry();

// Register OpenAI
defaultProviderRegistry.register("openai", (config: ModelConfig) => {
  return createOpenAI({
    apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    baseURL: config.baseURL || process.env.OPENAI_BASE_URL,
    fetch: config.proxyFetch,
  });
});

// Register Anthropic
defaultProviderRegistry.register("anthropic", (config: ModelConfig) => {
  return createAnthropic({
    apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    baseURL: config.baseURL || process.env.ANTHROPIC_BASE_URL,
    fetch: config.proxyFetch,
  });
});

// Register DeepSeek
defaultProviderRegistry.register("deepseek", (_config: ModelConfig) => {
  // DeepSeek provider usually relies on DEEPSEEK_API_KEY env var
  return deepseek;
});

// Register OpenRouter
defaultProviderRegistry.register("openrouter", (config: ModelConfig) => {
  const openrouterConfig: any = {
    apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
    fetch: config.proxyFetch,
  };

  // Support Helicone observability via OpenRouter
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
