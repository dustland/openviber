/**
 * WeChat (微信) Channel
 *
 * Integrates with a proxy-based WeChat API service and receives inbound
 * webhook events forwarded to OpenViber.
 */

import {
  Channel,
  ChannelRuntimeContext,
  InboundMessage,
  AgentStreamEvent,
  WeChatConfig,
} from "./channel";
import type { ChannelWebhookRoute, GatewayRequest } from "./webhook";

interface WeChatWebhookPayload {
  messageType?: string;
  wcId?: string;
  fromUser?: string;
  toUser?: string;
  fromGroup?: string;
  content?: string;
  newMsgId?: string | number;
  timestamp?: number;
  contentType?: string;
  raw?: unknown;
  data?: {
    fromUser?: string;
    toUser?: string;
    fromGroup?: string;
    content?: string;
    newMsgId?: string | number;
    timestamp?: number;
  };
}

interface WeChatProxyResponse {
  code?: string;
  message?: string;
  error?: string;
  data?: unknown;
}

interface NormalizedPayload {
  messageType: string;
  wcId: string;
  fromUser: string;
  toUser?: string;
  fromGroup?: string;
  content: string;
  newMsgId?: string | number;
  timestamp?: number;
  raw: unknown;
}

/**
 * WeChat webhook and proxy transport channel.
 */
export class WeChatChannel implements Channel {
  id = "wechat";
  type = "webhook" as const;

  private config: WeChatConfig;
  private context: ChannelRuntimeContext;
  private responseBuffers = new Map<string, string>();
  private replyTargets = new Map<string, string>();

  constructor(config: WeChatConfig, context: ChannelRuntimeContext) {
    this.config = config;
    this.context = context;
  }

  async start(): Promise<void> {
    console.log("[WeChat] Channel started");
  }

  async stop(): Promise<void> {
    this.responseBuffers.clear();
    this.replyTargets.clear();
    console.log("[WeChat] Channel stopped");
  }

  /**
   * Parse incoming webhook payload to a normalized inbound message.
   */
  parseWebhook(payload: WeChatWebhookPayload): InboundMessage | null {
    const normalized = normalizePayload(payload);
    if (!normalized) return null;

    if (normalized.messageType === "30000") {
      return null;
    }

    if (!isChatMessageType(normalized.messageType)) {
      return null;
    }

    if (!normalized.content?.trim()) {
      return null;
    }

    const isGroup = normalized.messageType.startsWith("8");
    const conversationId = isGroup
      ? `wechat:group:${normalized.fromGroup || normalized.fromUser}`
      : `wechat:direct:${normalized.fromUser}`;

    const replyTo = isGroup
      ? normalized.fromGroup || normalized.fromUser
      : normalized.fromUser;

    this.replyTargets.set(conversationId, replyTo);

    return {
      id: String(normalized.newMsgId || `${Date.now()}`),
      source: this.id,
      userId: normalized.fromUser,
      conversationId,
      content: normalized.content,
      metadata: {
        accountId: this.config.accountId || "default",
        wcId: normalized.wcId,
        replyTo,
        isGroup,
        messageType: normalized.messageType,
        toUser: normalized.toUser,
      },
    };
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    this.responseBuffers.set(message.conversationId, "");
    const replyTo = String(message.metadata?.replyTo || "");
    if (replyTo) {
      this.replyTargets.set(message.conversationId, replyTo);
    }
  }

  async stream(conversationId: string, event: AgentStreamEvent): Promise<void> {
    if (event.type === "text-delta") {
      const current = this.responseBuffers.get(conversationId) || "";
      this.responseBuffers.set(conversationId, `${current}${event.content}`);
      return;
    }

    if (event.type === "done") {
      const text = this.responseBuffers.get(conversationId) || "";
      if (text.trim()) {
        await this.sendText(conversationId, text);
      }
      this.responseBuffers.delete(conversationId);
      this.replyTargets.delete(conversationId);
      return;
    }

    if (event.type === "error") {
      await this.sendText(conversationId, `Error: ${event.error}`);
      this.responseBuffers.delete(conversationId);
      this.replyTargets.delete(conversationId);
    }
  }

  /**
   * Return webhook routes for WeChat callback ingestion.
   */
  getWebhookRoutes(): ChannelWebhookRoute[] {
    return [
      {
        method: "POST",
        path: "/webhook/wechat",
        handler: async (req) => this.handleWebhook(req),
      },
    ];
  }

  private async handleWebhook(req: GatewayRequest) {
    const payload = (req.json || safeJsonParse(req.body)) as WeChatWebhookPayload;
    if (!payload || typeof payload !== "object") {
      return { status: 400, json: { error: "Invalid payload" } };
    }

    const inbound = this.parseWebhook(payload);
    if (inbound) {
      await this.handleMessage(inbound);
      await this.context.routeMessage(inbound);
    }

    return { status: 200, body: "OK" };
  }

  private async sendText(conversationId: string, content: string): Promise<void> {
    const replyTo = this.replyTargets.get(conversationId);
    if (!replyTo) {
      console.error(`[WeChat] Missing reply target for conversation: ${conversationId}`);
      return;
    }

    const result = await this.proxyRequest("/v1/sendText", {
      wcId: replyTo,
      content,
    });

    if (result.code && !isProxySuccessCode(result.code)) {
      console.error("[WeChat] Send message failed:", result);
    }
  }

  private async proxyRequest(endpoint: string, body: Record<string, unknown>): Promise<WeChatProxyResponse> {
    const base = this.config.proxyUrl.replace(/\/$/, "");
    const response = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.apiKey,
        "X-Account-ID": this.config.accountId || "default",
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json().catch(() => ({}))) as WeChatProxyResponse;

    if (!response.ok) {
      throw new Error(json.error || json.message || `HTTP ${response.status}`);
    }

    return json;
  }
}

function isProxySuccessCode(code: string): boolean {
  return code === "1000" || code === "1001" || code === "1002";
}

function isChatMessageType(messageType?: string): boolean {
  if (!messageType) return false;
  return messageType.startsWith("6") || messageType.startsWith("8");
}

function normalizePayload(payload: WeChatWebhookPayload): NormalizedPayload | null {
  if (!payload.messageType || !payload.wcId) {
    return null;
  }

  if (payload.fromUser) {
    return {
      messageType: payload.messageType,
      wcId: payload.wcId,
      fromUser: payload.fromUser,
      toUser: payload.toUser,
      fromGroup: payload.fromGroup,
      content: payload.content ?? "",
      newMsgId: payload.newMsgId,
      timestamp: payload.timestamp,
      raw: payload.raw ?? payload,
    };
  }

  const nested = payload.data || {};
  if (!nested.fromUser) {
    return null;
  }

  return {
    messageType: payload.messageType,
    wcId: payload.wcId,
    fromUser: nested.fromUser,
    toUser: nested.toUser,
    fromGroup: nested.fromGroup,
    content: nested.content ?? "",
    newMsgId: nested.newMsgId,
    timestamp: nested.timestamp,
    raw: payload,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
