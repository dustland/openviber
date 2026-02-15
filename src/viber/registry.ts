import { ModelConfig } from "./model-types";

export type ProviderFactory = (config: ModelConfig) => any;

/**
 * Registry for AI Providers.
 * Allows dynamic registration of providers to keep the core decoupled.
 */
class Registry {
  private providers = new Map<string, ProviderFactory>();

  /**
   * Register a new provider factory.
   * @param name The name of the provider (e.g., "openai", "anthropic")
   * @param factory A function that takes config and returns a provider instance
   */
  register(name: string, factory: ProviderFactory) {
    this.providers.set(name, factory);
  }

  /**
   * Get a provider instance by name.
   */
  get(name: string, config: ModelConfig): any {
    const factory = this.providers.get(name);
    if (!factory) {
      throw new Error(
        `Provider '${name}' is not registered. ` +
        `Available providers: ${Array.from(this.providers.keys()).join(", ")}`
      );
    }
    return factory(config);
  }

  /**
   * Check if a provider is registered.
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * List all registered providers.
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const ProviderRegistry = new Registry();
