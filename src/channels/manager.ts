/**
 * Channel Manager
 *
 * Central registry and router for command center channels.
 * Routes inbound messages to ViberAgent and broadcasts
 * agent events to the originating channel.
 */

import { EventEmitter } from "events";
import {
  Channel,
  InboundMessage,
  AgentStreamEvent,
  InterruptSignal,
} from "./channel";
import { ViberAgent } from "../worker/viber-agent";
import { createLogger } from "../utils/logger";

const log = createLogger("ChannelManager");

interface ActiveConversation {
  channelId: string;
  agent: ViberAgent;
  startedAt: Date;
}

export class ChannelManager extends EventEmitter {
  private channels = new Map<string, Channel>();
  private conversations = new Map<string, ActiveConversation>();

  /**
   * Register a channel
   */
  register(channel: Channel): void {
    if (this.channels.has(channel.id)) {
      log.warn("Channel already registered", { channelId: channel.id });
      return;
    }
    this.channels.set(channel.id, channel);
    log.info("Registered channel", { channelId: channel.id });
  }

  /**
   * Unregister a channel
   */
  unregister(id: string): void {
    this.channels.delete(id);
    log.info("Unregistered channel", { channelId: id });
  }

  /**
   * Get a channel by ID
   */
  getChannel(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  /**
   * Start all registered channels
   */
  async startAll(): Promise<void> {
    for (const [id, channel] of this.channels) {
      try {
        await channel.start();
        log.info("Started channel", { channelId: id });
      } catch (error) {
        log.error("Failed to start channel", {
          data: { channelId: id, error: String((error as Error)?.message ?? error) },
        });
      }
    }
  }

  /**
   * Stop all registered channels in parallel
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.channels.entries()).map(
      async ([id, channel]) => {
        try {
          await channel.stop();
          log.info("Stopped channel", { channelId: id });
        } catch (error) {
          log.error("Failed to stop channel", {
            data: { channelId: id, error: String((error as Error)?.message ?? error) },
          });
        }
      }
    );

    await Promise.all(stopPromises);
  }

  /**
   * Route an inbound message to ViberAgent
   */
  async routeMessage(message: InboundMessage): Promise<void> {
    const { source, conversationId, content, userId } = message;

    log.info("Routing message", {
      source,
      conversationId,
      contentPreview: content.substring(0, 50),
    });

    // Get or create conversation
    let conversation = this.conversations.get(conversationId);

    if (!conversation) {
      // Create new ViberAgent for this conversation
      const agent = await ViberAgent.start(content, {
        // Use conversation ID as space ID for isolation
        spaceId: conversationId,
      });

      conversation = {
        channelId: source,
        agent,
        startedAt: new Date(),
      };
      this.conversations.set(conversationId, conversation);
    }

    // Execute and stream response
    try {
      const result = await conversation.agent.streamText({
        messages: [{ role: "user", content }],
        metadata: { userId, source },
      });

      const channel = this.channels.get(source);
      if (!channel) {
        log.error("Channel not found", { source });
        return;
      }

      // Stream events back to channel
      for await (const chunk of result.fullStream) {
        await channel.stream(conversationId, this.mapToStreamEvent(chunk));
      }

      // Send done event
      await channel.stream(conversationId, {
        type: "done",
        agentId: conversation.agent.spaceId,
      });
    } catch (error: any) {
      log.error("Error processing message", {
        data: { error: String((error as Error)?.message ?? error) },
      });

      const channel = this.channels.get(source);
      if (channel) {
        await channel.stream(conversationId, {
          type: "error",
          error: error.message,
          agentId: conversation?.agent?.spaceId || "unknown",
        });
      }
    }
  }

  /**
   * Handle interrupt signal
   */
  async handleInterrupt(signal: InterruptSignal): Promise<void> {
    const conversation = this.conversations.get(signal.conversationId);
    if (conversation) {
      conversation.agent.stop();
      this.conversations.delete(signal.conversationId);
      log.info("Interrupted conversation", {
        conversationId: signal.conversationId,
      });
    }
  }

  /**
   * Map AI SDK stream chunk to AgentStreamEvent
   */
  private mapToStreamEvent(chunk: any): AgentStreamEvent {
    if (chunk.type === "text-delta") {
      return {
        type: "text-delta",
        content: chunk.textDelta,
        agentId: "viber",
      };
    }
    if (chunk.type === "tool-call") {
      return {
        type: "tool-call",
        tool: chunk.toolName,
        args: chunk.args,
        agentId: "viber",
      };
    }
    if (chunk.type === "tool-result") {
      return {
        type: "tool-result",
        tool: chunk.toolName,
        result: chunk.result,
        agentId: "viber",
      };
    }
    // Default passthrough
    return {
      type: "state-change",
      state: chunk.type,
      agentId: "viber",
    };
  }
}

// Singleton instance
export const channelManager = new ChannelManager();
