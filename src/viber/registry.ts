import { ModelConfig, ModelProvider, ModelProviderFactory } from "./model-types";

/**
 * Registry for AI Model Providers.
 * Allows dynamic registration of providers (OpenAI, Anthropic, etc.)
 * replacing hardcoded switch statements.
 */
export class ProviderRegistry {
  private providers: Map<ModelProvider, ModelProviderFactory> = new Map();

  /**
   * Register a new provider factory
   * @param provider The provider identifier (e.g., "openai")
   * @param factory A function that takes config and returns an AI SDK model instance
   */
  register(provider: ModelProvider, factory: ModelProviderFactory): void {
    this.providers.set(provider, factory);
  }

  /**
   * Get an instantiated model from a registered provider
   * @param config The configuration including provider name and settings
   */
  get(config: ModelConfig): any {
    const factory = this.providers.get(config.provider);
    if (!factory) {
      // Fallback or helpful error message
      const registered = Array.from(this.providers.keys()).join(", ");
      throw new Error(
        `Provider '${config.provider}' is not registered. ` +
        `Available providers: ${registered}.`
      );
    }
    return factory(config);
  }

  /**
   * Check if a provider is registered
   */
  has(provider: ModelProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * List all registered providers
   */
  list(): ModelProvider[] {
    return Array.from(this.providers.keys());
  }
}
