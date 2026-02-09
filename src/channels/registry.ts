import type { Channel, ChannelRuntimeContext, ChannelConfig } from "./channel";

export interface ChannelFactory<TConfig extends ChannelConfig> {
  /** Unique channel identifier (e.g., "discord") */
  id: string;
  /** Human-friendly label for UI */
  displayName: string;
  /** Short description for UI/tooling */
  description?: string;
  /** Create a channel instance from config */
  create(config: TConfig, context: ChannelRuntimeContext): Channel;
}

/**
 * ChannelRegistry keeps a catalog of available channel factories.
 * It enables a universal, plugin-like integration model for gateway setup.
 */
export class ChannelRegistry {
  private factories = new Map<string, ChannelFactory<any>>();

  /**
   * Register a channel factory.
   */
  register<TConfig extends ChannelConfig>(factory: ChannelFactory<TConfig>): void {
    if (this.factories.has(factory.id)) {
      throw new Error(`Channel factory "${factory.id}" already registered`);
    }
    this.factories.set(factory.id, factory);
  }

  /**
   * Get a channel factory by id.
   */
  get<TConfig extends ChannelConfig>(id: string): ChannelFactory<TConfig> | undefined {
    return this.factories.get(id);
  }

  /**
   * List all registered factories.
   */
  list(): ChannelFactory<any>[] {
    return Array.from(this.factories.values());
  }
}

export const channelRegistry = new ChannelRegistry();
