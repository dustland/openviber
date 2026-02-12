/**
 * Channel Interface
 *
 * Channels bridge external command centers (chat apps, web UIs, APIs)
 * to the Viber runtime. They handle inbound messages and stream
 * agent responses back to the source.
 */

import { ViberAgent, ViberOptions } from "../viber/viber-agent";

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

/**
 * ChannelRuntimeContext provides routing hooks for channel implementations.
 */
export interface ChannelRuntimeContext {
  routeMessage(message: InboundMessage): Promise<void>;
  handleInterrupt(signal: InterruptSignal): Promise<void>;
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

/** WeChat (微信) channel configuration via webhook + proxy API. */
export interface WeChatConfig extends ChannelConfig {
  /** API key issued by the upstream WeChat proxy service */
  apiKey: string;
  /** Base URL for proxy API endpoints */
  proxyUrl: string;
  /** Optional account selector for proxy multi-account setups */
  accountId?: string;
}

/** Discord channel configuration. */
export interface DiscordConfig extends ChannelConfig {
  /** Discord bot token */
  botToken: string;
  /** Optional application ID (for mention parsing or diagnostics) */
  appId?: string;
  /** Allowlist of guild IDs (empty = all) */
  allowGuildIds?: string[];
  /** Allowlist of channel IDs (empty = all) */
  allowChannelIds?: string[];
  /** Allowlist of user IDs (empty = all) */
  allowUserIds?: string[];
  /** Require @mention in guild channels (default: true) */
  requireMention?: boolean;
  /** Reply mode for responses in guilds */
  replyMode?: "reply" | "channel";
}

/** Feishu (Lark) channel configuration. */
export interface FeishuConfig extends ChannelConfig {
  /** Feishu/Lark app ID */
  appId: string;
  /** Feishu/Lark app secret */
  appSecret: string;
  /** Verification token for event validation */
  verificationToken?: string;
  /** Encrypt key for event payloads */
  encryptKey?: string;
  /** Feishu or Lark domain */
  domain?: "feishu" | "lark" | string;
  /** Connection mode (default: websocket) */
  connectionMode?: "websocket" | "webhook";
  /** Webhook path when using webhook mode */
  webhookPath?: string;
  /** Allow group chats to trigger the bot */
  allowGroupMessages?: boolean;
  /** Require @mention in group chats (default: true) */
  requireMention?: boolean;
}

export interface WebConfig extends ChannelConfig {
  // No special config needed for web channel
}

export interface ChannelsConfig {
  dingtalk?: DingTalkConfig;
  wecom?: WeComConfig;
  wechat?: WeChatConfig;
  discord?: DiscordConfig;
  feishu?: FeishuConfig;
  web?: WebConfig;
}
