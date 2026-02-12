import type { Channel, ChannelRuntimeContext, ChannelConfig } from "./channel";

export type ChannelTransportType = "webhook" | "websocket" | "sse";

export interface ChannelCapabilityMetadata {
  /** Channel transport behavior. */
  transport: ChannelTransportType;
  /** Whether the channel supports inbound attachments natively. */
  supportsInboundAttachments: boolean;
  /** Primary authentication/configuration strategy summary. */
  auth: string;
  /** Optional controls for mention/scope/allowlist behavior. */
  controls?: string[];
  /** Production readiness guidance. */
  productionReadiness: "ready" | "beta";
}

export interface ChannelFactory<TConfig extends ChannelConfig> {
  /** Unique channel identifier (e.g., "discord") */
  id: string;
  /** Human-friendly label for UI */
  displayName: string;
  /** Short description for UI/tooling */
  description?: string;
  /** Structured channel capability metadata for docs/tooling. */
  capabilities: ChannelCapabilityMetadata;
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

  /**
   * List capability metadata for all registered channels.
   */
  listCapabilities(): Array<
    Pick<ChannelFactory<any>, "id" | "displayName" | "description"> & {
      capabilities: ChannelCapabilityMetadata;
    }
  > {
    return this.list().map((factory) => ({
      id: factory.id,
      displayName: factory.displayName,
      description: factory.description,
      capabilities: factory.capabilities,
    }));
  }
}

export const channelRegistry = new ChannelRegistry();
