/**
 * Web Channel
 *
 * Simple HTTP/SSE channel for web-based chat interfaces.
 * Receives messages via POST and streams responses via SSE.
 * No database required - uses in-memory state.
 */

import { EventEmitter } from "events";
import {
  Channel,
  InboundMessage,
  AgentStreamEvent,
  WebConfig,
} from "./channel";

// ==================== Types ====================

interface WebMessage {
  conversationId: string;
  content: string;
  userId?: string;
}

// ==================== Channel Implementation ====================

export class WebChannel extends EventEmitter implements Channel {
  id = "web";
  type = "sse" as const;

  private config: WebConfig;
  private sseConnections = new Map<string, Set<(event: AgentStreamEvent) => void>>();

  constructor(config: WebConfig = { enabled: true }) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    console.log("[Web] Channel started");
  }

  async stop(): Promise<void> {
    // Close all SSE connections
    for (const [conversationId, listeners] of this.sseConnections) {
      for (const listener of listeners) {
        listener({ type: "done", agentId: "system" });
      }
    }
    this.sseConnections.clear();
    console.log("[Web] Channel stopped");
  }

  /**
   * Parse HTTP request body to InboundMessage
   */
  parseRequest(body: WebMessage): InboundMessage {
    return {
      id: crypto.randomUUID(),
      source: this.id,
      userId: body.userId || "anonymous",
      conversationId: body.conversationId || crypto.randomUUID(),
      content: body.content,
    };
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    // Message handling is done via the channel manager
    // This just triggers the routing
  }

  /**
   * Register an SSE connection for a conversation
   */
  registerSSEConnection(
    conversationId: string,
    listener: (event: AgentStreamEvent) => void
  ): () => void {
    if (!this.sseConnections.has(conversationId)) {
      this.sseConnections.set(conversationId, new Set());
    }
    this.sseConnections.get(conversationId)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.sseConnections.get(conversationId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.sseConnections.delete(conversationId);
        }
      }
    };
  }

  async stream(
    conversationId: string,
    event: AgentStreamEvent
  ): Promise<void> {
    const listeners = this.sseConnections.get(conversationId);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  /**
   * Create SSE response headers
   */
  static createSSEHeaders(): Record<string, string> {
    return {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    };
  }

  /**
   * Format event for SSE
   */
  static formatSSEEvent(event: AgentStreamEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }
}

// Default instance
export const webChannel = new WebChannel();
