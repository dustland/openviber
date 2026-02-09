/**
 * DingTalk Channel
 *
 * Integrates with DingTalk Enterprise Bot via webhook.
 * Receives messages via HTTP POST and sends replies via DingTalk API.
 *
 * @see https://open.dingtalk.com/document/orgapp/receive-message
 */

import crypto from "crypto";
import {
  Channel,
  ChannelRuntimeContext,
  InboundMessage,
  AgentStreamEvent,
  DingTalkConfig,
} from "./channel";
import type { ChannelWebhookRoute, GatewayRequest } from "./webhook";

// ==================== DingTalk Types ====================

interface DingTalkWebhookPayload {
  msgtype: string;
  text?: { content: string };
  msgId: string;
  createAt: number;
  conversationType: string;
  conversationId: string;
  conversationTitle?: string;
  senderId: string;
  senderNick: string;
  senderCorpId?: string;
  sessionWebhook: string;
  sessionWebhookExpiredTime: number;
  isAdmin?: boolean;
  robotCode?: string;
}

interface DingTalkOutgoingMessage {
  msgtype: "text" | "markdown" | "actionCard";
  text?: { content: string };
  markdown?: { title: string; text: string };
  actionCard?: {
    title: string;
    text: string;
    singleTitle?: string;
    singleURL?: string;
  };
}

// ==================== Channel Implementation ====================

export class DingTalkChannel implements Channel {
  id = "dingtalk";
  type = "webhook" as const;

  private config: DingTalkConfig;
  private context: ChannelRuntimeContext;
  private sessionWebhooks = new Map<string, string>();
  private responseBuffers = new Map<string, string>();

  constructor(config: DingTalkConfig, context: ChannelRuntimeContext) {
    this.config = config;
    this.context = context;
  }

  async start(): Promise<void> {
    console.log("[DingTalk] Channel started");
  }

  async stop(): Promise<void> {
    this.sessionWebhooks.clear();
    this.responseBuffers.clear();
    console.log("[DingTalk] Channel stopped");
  }

  /**
   * Verify webhook signature
   */
  verifySignature(timestamp: string, sign: string): boolean {
    const stringToSign = timestamp + "\n" + this.config.appSecret;
    const hmac = crypto.createHmac("sha256", this.config.appSecret);
    hmac.update(stringToSign);
    const expectedSign = hmac.digest("base64");
    return sign === expectedSign;
  }

  /**
   * Parse webhook payload to InboundMessage
   */
  parseWebhook(payload: DingTalkWebhookPayload): InboundMessage {
    // Store session webhook for replying
    this.sessionWebhooks.set(payload.conversationId, payload.sessionWebhook);

    return {
      id: payload.msgId,
      source: this.id,
      userId: payload.senderId,
      conversationId: payload.conversationId,
      content: payload.text?.content || "",
      metadata: {
        senderNick: payload.senderNick,
        conversationType: payload.conversationType,
        conversationTitle: payload.conversationTitle,
        robotCode: payload.robotCode,
      },
    };
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    // Initialize buffer for streaming response
    this.responseBuffers.set(message.conversationId, "");
  }

  async stream(
    conversationId: string,
    event: AgentStreamEvent
  ): Promise<void> {
    const sessionWebhook = this.sessionWebhooks.get(conversationId);
    if (!sessionWebhook) {
      console.error(
        `[DingTalk] No session webhook for conversation: ${conversationId}`
      );
      return;
    }

    if (event.type === "text-delta") {
      // Buffer text deltas
      const current = this.responseBuffers.get(conversationId) || "";
      this.responseBuffers.set(conversationId, current + event.content);
    } else if (event.type === "done") {
      // Send complete response
      const text = this.responseBuffers.get(conversationId) || "";
      await this.sendMessage(sessionWebhook, {
        msgtype: "markdown",
        markdown: {
          title: "Reply",
          text: text,
        },
      });
      this.responseBuffers.delete(conversationId);
    } else if (event.type === "error") {
      // Send error message
      await this.sendMessage(sessionWebhook, {
        msgtype: "text",
        text: { content: `Error: ${event.error}` },
      });
      this.responseBuffers.delete(conversationId);
    }
  }

  getWebhookRoutes(): ChannelWebhookRoute[] {
    return [
      {
        method: "POST",
        path: "/webhook/dingtalk",
        handler: async (req) => this.handleWebhook(req),
      },
    ];
  }

  private async handleWebhook(req: GatewayRequest) {
    const payload = (req.json || safeJsonParse(req.body)) as DingTalkWebhookPayload;
    if (!payload) {
      return { status: 400, json: { error: "Invalid payload" } };
    }

    const timestamp =
      req.query.get("timestamp") ||
      (typeof req.headers["timestamp"] === "string" ? req.headers["timestamp"] : "");
    const sign =
      req.query.get("sign") ||
      (typeof req.headers["sign"] === "string" ? req.headers["sign"] : "");

    if (timestamp && sign && !this.verifySignature(timestamp, sign)) {
      return { status: 401, json: { error: "Invalid signature" } };
    }

    const inbound = this.parseWebhook(payload);
    await this.handleMessage(inbound);
    await this.context.routeMessage(inbound);
    return { status: 200, json: { ok: true } };
  }

  /**
   * Send message via DingTalk session webhook
   */
  private async sendMessage(
    webhookUrl: string,
    message: DingTalkOutgoingMessage
  ): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("[DingTalk] Send message failed:", error);
      }
    } catch (error) {
      console.error("[DingTalk] Send message error:", error);
    }
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
