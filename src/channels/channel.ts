/**
 * Channel Interface
 *
 * Channels bridge external command centers (chat apps, web UIs, APIs)
 * to the Viber runtime. They handle inbound messages and stream
 * agent responses back to the source.
 */

import type { ViberOptions } from "../core/viber";

// ==================== Core Types ====================

export interface InboundMessage {
  /** Unique message ID */
  id: string;
  /** Source channel ID (e.g., 'dingtalk', 'wecom', 'web') */
  source: string;
  /** User identifier from the source platform */
  userId: string;
  /** Conversation/session identifier */
  conversationId: string;
  /** Message content */
  content: string;
  /** Optional attachments */
  attachments?: Attachment[];
  /** Platform-specific metadata */
  metadata?: Record<string, any>;
}

export interface Attachment {
  type: "file" | "image" | "audio" | "video";
  url?: string;
  data?: Buffer;
  name?: string;
  mimeType?: string;
}

export interface InterruptSignal {
  conversationId: string;
  reason?: string;
}

export type AgentStreamEvent =
  | { type: "text-delta"; content: string; agentId: string }
  | { type: "tool-call"; tool: string; args: unknown; agentId: string }
  | { type: "tool-result"; tool: string; result: unknown; agentId: string }
  | { type: "state-change"; state: string; agentId: string }
  | { type: "error"; error: string; agentId: string }
  | { type: "done"; agentId: string };

// ==================== Channel Interface ====================

export interface Channel {
  /** Unique channel identifier */
  id: string;

  /** Channel type */
  type: "webhook" | "websocket" | "sse";

  /**
   * Start the channel (e.g., start listening for webhooks)
   */
  start(): Promise<void>;

  /**
   * Stop the channel gracefully
   */
  stop(): Promise<void>;

  /**
   * Handle an inbound message from the command center
   */
  handleMessage(message: InboundMessage): Promise<void>;

  /**
   * Handle an interrupt signal (user cancelled, timeout, etc.)
   */
  handleInterrupt?(signal: InterruptSignal): Promise<void>;

  /**
   * Stream an agent event back to the command center
   */
  stream(conversationId: string, event: AgentStreamEvent): Promise<void>;
}

// ==================== Channel Configuration ====================

export interface ChannelConfig {
  enabled: boolean;
  [key: string]: any;
}

export interface DingTalkConfig extends ChannelConfig {
  appKey: string;
  appSecret: string;
  robotCode?: string;
}

export interface WeComConfig extends ChannelConfig {
  corpId: string;
  agentId: string;
  secret: string;
  token: string;
  aesKey: string;
}

export interface WebConfig extends ChannelConfig {
  // No special config needed for web channel
}

export interface ChannelsConfig {
  dingtalk?: DingTalkConfig;
  wecom?: WeComConfig;
  web?: WebConfig;
}
