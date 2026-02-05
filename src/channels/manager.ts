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
import { ViberAgent } from "../core/viber-agent";

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
      console.warn(`[ChannelManager] Channel ${channel.id} already registered`);
      return;
    }
    this.channels.set(channel.id, channel);
    console.log(`[ChannelManager] Registered channel: ${channel.id}`);
  }

  /**
   * Unregister a channel
   */
  unregister(id: string): void {
    this.channels.delete(id);
    console.log(`[ChannelManager] Unregistered channel: ${id}`);
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
        console.log(`[ChannelManager] Started channel: ${id}`);
      } catch (error) {
        console.error(`[ChannelManager] Failed to start channel ${id}:`, error);
      }
    }
  }

  /**
   * Stop all registered channels
   */
  async stopAll(): Promise<void> {
    for (const [id, channel] of this.channels) {
      try {
        await channel.stop();
        console.log(`[ChannelManager] Stopped channel: ${id}`);
      } catch (error) {
        console.error(`[ChannelManager] Failed to stop channel ${id}:`, error);
      }
    }
  }

  /**
   * Route an inbound message to ViberAgent
   */
  async routeMessage(message: InboundMessage): Promise<void> {
    const { source, conversationId, content, userId } = message;

    console.log(
      `[ChannelManager] Routing message from ${source}: ${content.substring(0, 50)}...`
    );

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
        console.error(`[ChannelManager] Channel not found: ${source}`);
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
      console.error(`[ChannelManager] Error processing message:`, error);

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
      console.log(
        `[ChannelManager] Interrupted conversation: ${signal.conversationId}`
      );
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
