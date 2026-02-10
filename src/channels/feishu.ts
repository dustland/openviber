/**
 * Feishu (Lark) Channel
 *
 * Supports WebSocket event subscription and webhook mode.
 */

import * as Lark from "@larksuiteoapi/node-sdk";
import type {
  AgentStreamEvent,
  Channel,
  ChannelRuntimeContext,
  FeishuConfig,
  InboundMessage,
} from "./channel";
import type { ChannelWebhookRoute, GatewayRequest } from "./webhook";

type FeishuConversation = {
  chatId: string;
  chatType: "p2p" | "group";
  senderOpenId: string;
  messageId: string;
};

type FeishuMessageEvent = {
  sender: {
    sender_id?: {
      open_id?: string;
    };
    sender_type?: string;
  };
  message: {
    message_id: string;
    chat_id: string;
    chat_type: "p2p" | "group";
    message_type: string;
    content: string;
    mentions?: Array<{
      id?: { open_id?: string };
      name?: string;
    }>;
  };
};

export class FeishuChannel implements Channel {
  id = "feishu";
  type: "webhook" | "websocket" | "sse";

  private client: Lark.Client | null = null;
  private wsClient: Lark.WSClient | null = null;
  private dispatcher: Lark.EventDispatcher | null = null;
  private responseBuffers = new Map<string, string>();
  private conversations = new Map<string, FeishuConversation>();
  private botOpenId: string | null = null;

  constructor(
    private config: FeishuConfig,
    private context: ChannelRuntimeContext,
  ) {
    this.type = config.connectionMode === "webhook" ? "webhook" : "websocket";
  }

  async start(): Promise<void> {
    if (this.config.connectionMode === "webhook") {
      console.log("[Feishu] Channel started in webhook mode");
      return;
    }

    this.client = createFeishuClient(this.config);
    this.wsClient = createFeishuWsClient(this.config);
    this.dispatcher = new Lark.EventDispatcher({
      encryptKey: this.config.encryptKey,
      verificationToken: this.config.verificationToken,
    });

    this.dispatcher.register({
      "im.message.receive_v1": async (data) => {
        await this.handleFeishuMessage(data as FeishuMessageEvent);
      },
    });

    try {
      this.botOpenId = await fetchBotOpenId(this.config);
    } catch {
      this.botOpenId = null;
    }

    await this.wsClient.start({ eventDispatcher: this.dispatcher });
    console.log("[Feishu] Channel started (websocket)");
  }

  async stop(): Promise<void> {
    this.responseBuffers.clear();
    this.conversations.clear();
    if (this.wsClient && typeof this.wsClient.stop === "function") {
      this.wsClient.stop();
    }
    this.wsClient = null;
    this.dispatcher = null;
    this.client = null;
    console.log("[Feishu] Channel stopped");
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    this.responseBuffers.set(message.conversationId, "");
  }

  async stream(conversationId: string, event: AgentStreamEvent): Promise<void> {
    if (event.type === "text-delta") {
      const current = this.responseBuffers.get(conversationId) || "";
      this.responseBuffers.set(conversationId, current + event.content);
      return;
    }

    if (event.type === "done") {
      const text = this.responseBuffers.get(conversationId) || "";
      await this.sendFeishuMessage(conversationId, text);
      this.responseBuffers.delete(conversationId);
      return;
    }

    if (event.type === "error") {
      await this.sendFeishuMessage(conversationId, `Error: ${event.error}`);
      this.responseBuffers.delete(conversationId);
    }
  }

  getWebhookRoutes(): ChannelWebhookRoute[] {
    if (this.config.connectionMode !== "webhook") {
      return [];
    }
    const path = this.config.webhookPath || "/webhook/feishu";
    return [
      {
        method: "POST",
        path,
        handler: async (req) => this.handleWebhook(req),
      },
    ];
  }

  private async handleWebhook(req: GatewayRequest) {
    const payload = (req.json || safeJsonParse(req.body)) as any;
    if (!payload || typeof payload !== "object") {
      return { status: 400, json: { error: "Invalid payload" } };
    }

    if (payload.type === "url_verification" && payload.challenge) {
      return { status: 200, json: { challenge: payload.challenge } };
    }

    if (this.config.verificationToken && payload.token !== this.config.verificationToken) {
      return { status: 401, json: { error: "Invalid token" } };
    }

    const event = payload.event as FeishuMessageEvent | undefined;
    if (event) {
      await this.handleFeishuMessage(event);
    }

    return { status: 200, json: { ok: true } };
  }

  private async handleFeishuMessage(event: FeishuMessageEvent): Promise<void> {
    if (event.sender?.sender_type === "bot") return;

    const senderOpenId = event.sender?.sender_id?.open_id;
    if (!senderOpenId) return;

    const message = event.message;
    const isGroup = message.chat_type === "group";

    if (isGroup && !this.config.allowGroupMessages) {
      return;
    }

    if (isGroup && this.config.requireMention !== false) {
      const mentionedBot = this.isBotMentioned(message.mentions);
      if (!mentionedBot) return;
    }

    const content = parseFeishuMessageContent(message.content, message.message_type);
    const conversationId = message.chat_id;

    const inbound: InboundMessage = {
      id: message.message_id,
      source: this.id,
      userId: senderOpenId,
      conversationId,
      content,
      metadata: {
        chatId: message.chat_id,
        chatType: message.chat_type,
        messageType: message.message_type,
      },
    };

    this.conversations.set(conversationId, {
      chatId: message.chat_id,
      chatType: message.chat_type,
      senderOpenId,
      messageId: message.message_id,
    });

    await this.handleMessage(inbound);
    await this.context.routeMessage(inbound);
  }

  private isBotMentioned(
    mentions: FeishuMessageEvent["message"]["mentions"],
  ): boolean {
    if (!mentions || mentions.length === 0) return false;
    if (!this.botOpenId) return true;
    return mentions.some((mention) => mention.id?.open_id === this.botOpenId);
  }

  private async sendFeishuMessage(conversationId: string, text: string): Promise<void> {
    if (!text.trim()) return;
    if (!this.client) {
      this.client = createFeishuClient(this.config);
    }
    const ctx = this.conversations.get(conversationId);
    if (!ctx) return;

    const receiveIdType = ctx.chatType === "p2p" ? "open_id" : "chat_id";
    const receiveId = ctx.chatType === "p2p" ? ctx.senderOpenId : ctx.chatId;

    await this.client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: receiveId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
  }
}

function parseFeishuMessageContent(content: string, messageType: string): string {
  try {
    const parsed = JSON.parse(content);
    if (messageType === "text") {
      return parsed.text || "";
    }
  } catch {
    // ignore parsing errors
  }
  return content || "(no text)";
}

function createFeishuClient(config: FeishuConfig): Lark.Client {
  return new Lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveFeishuDomain(config.domain),
  });
}

function createFeishuWsClient(config: FeishuConfig): Lark.WSClient {
  return new Lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: resolveFeishuDomain(config.domain),
    loggerLevel: Lark.LoggerLevel.error,
  });
}

function resolveFeishuDomain(domain?: string): string | Lark.Domain {
  if (!domain || domain === "feishu") return Lark.Domain.Feishu;
  if (domain === "lark") return Lark.Domain.Lark;
  return domain.replace(/\/+$/, "");
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function fetchBotOpenId(config: FeishuConfig): Promise<string | null> {
  const baseUrl = resolveFeishuBaseUrl(config.domain);
  const tokenRes = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });
  if (!tokenRes.ok) return null;
  const tokenPayload = (await tokenRes.json()) as any;
  const token = tokenPayload?.tenant_access_token;
  if (!token) return null;

  const botRes = await fetch(`${baseUrl}/open-apis/bot/v3/info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!botRes.ok) return null;
  const botPayload = (await botRes.json()) as any;
  return botPayload?.data?.open_id ?? null;
}

function resolveFeishuBaseUrl(domain?: string): string {
  if (!domain || domain === "feishu") return "https://open.feishu.cn";
  if (domain === "lark") return "https://open.larksuite.com";
  return domain.replace(/\/+$/, "");
}
