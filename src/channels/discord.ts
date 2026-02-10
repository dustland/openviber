/**
 * Discord Channel
 *
 * Connects to Discord Gateway via discord.js.
 * Receives messages and streams agent responses back.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import type {
  AgentStreamEvent,
  Channel,
  ChannelRuntimeContext,
  DiscordConfig,
  InboundMessage,
} from "./channel";

type DiscordConversation = {
  channelId: string;
  replyToId?: string;
  userId: string;
  guildId?: string | null;
};

export class DiscordChannel implements Channel {
  id = "discord";
  type = "websocket" as const;

  private client: Client | null = null;
  private conversations = new Map<string, DiscordConversation>();
  private responseBuffers = new Map<string, string>();

  constructor(
    private config: DiscordConfig,
    private context: ChannelRuntimeContext,
  ) {}

  async start(): Promise<void> {
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ];

    this.client = new Client({
      intents,
      partials: [Partials.Channel],
    });

    this.client.on("messageCreate", (message) => {
      void this.handleDiscordMessage(message);
    });

    await this.client.login(this.config.botToken);
    console.log("[Discord] Channel started");
  }

  async stop(): Promise<void> {
    this.responseBuffers.clear();
    this.conversations.clear();
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    console.log("[Discord] Channel stopped");
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    this.responseBuffers.set(message.conversationId, "");
  }

  async stream(
    conversationId: string,
    event: AgentStreamEvent,
  ): Promise<void> {
    if (event.type === "text-delta") {
      const current = this.responseBuffers.get(conversationId) || "";
      this.responseBuffers.set(conversationId, current + event.content);
      return;
    }

    if (event.type === "done") {
      const text = this.responseBuffers.get(conversationId) || "";
      await this.sendDiscordMessage(conversationId, text);
      this.responseBuffers.delete(conversationId);
      return;
    }

    if (event.type === "error") {
      await this.sendDiscordMessage(conversationId, `Error: ${event.error}`);
      this.responseBuffers.delete(conversationId);
    }
  }

  private async handleDiscordMessage(message: Message): Promise<void> {
    if (!this.client) return;
    if (message.author?.bot) return;

    const botId = this.client.user?.id;
    if (!botId) return;

    if (!this.isAllowedSender(message)) return;

    const isGuild = Boolean(message.guildId);
    if (isGuild) {
      const requireMention = this.config.requireMention !== false;
      if (requireMention && !message.mentions.users.has(botId)) {
        return;
      }
    }

    const content = this.stripBotMention(message.content, botId) || "(no text)";
    const conversationId = message.channelId;

    const inbound: InboundMessage = {
      id: message.id,
      source: this.id,
      userId: message.author.id,
      conversationId,
      content,
      attachments: mapDiscordAttachments(message),
      metadata: {
        channelId: message.channelId,
        guildId: message.guildId,
        messageId: message.id,
        threadId: message.thread?.id,
      },
    };

    this.conversations.set(conversationId, {
      channelId: message.channelId,
      replyToId: message.id,
      userId: message.author.id,
      guildId: message.guildId,
    });

    await this.handleMessage(inbound);
    await this.context.routeMessage(inbound);
  }

  private stripBotMention(text: string, botId: string): string {
    const pattern = new RegExp(`<@!?${botId}>`, "g");
    return text.replace(pattern, "").trim();
  }

  private isAllowedSender(message: Message): boolean {
    const { allowGuildIds, allowChannelIds, allowUserIds } = this.config;

    if (allowUserIds?.length && !allowUserIds.includes(message.author.id)) {
      return false;
    }

    if (message.guildId && allowGuildIds?.length) {
      if (!allowGuildIds.includes(message.guildId)) return false;
    }

    if (allowChannelIds?.length) {
      if (!allowChannelIds.includes(message.channelId)) return false;
    }

    return true;
  }

  private async sendDiscordMessage(
    conversationId: string,
    content: string,
  ): Promise<void> {
    if (!this.client) return;
    if (!content.trim()) return;

    const ctx = this.conversations.get(conversationId);
    if (!ctx) return;

    const channel = await this.client.channels.fetch(ctx.channelId);
    if (!channel || !channel.isTextBased()) return;

    const chunks = chunkDiscordText(content, 2000);
    const replyMode = this.config.replyMode ?? "reply";

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk) continue;
      await sendToTextChannel(
        channel,
        chunk,
        replyMode === "reply" && i === 0 ? ctx.replyToId : undefined,
      );
    }
  }
}

function mapDiscordAttachments(message: Message): InboundMessage["attachments"] | undefined {
  if (!message.attachments || message.attachments.size === 0) return undefined;
  const attachments = Array.from(message.attachments.values()).map((att) => ({
    type: att.contentType?.startsWith("image/") ? "image" : "file",
    url: att.url,
    name: att.name ?? undefined,
    mimeType: att.contentType ?? undefined,
  }));
  return attachments.length > 0 ? attachments : undefined;
}

async function sendToTextChannel(
  channel: TextBasedChannel,
  content: string,
  replyToId?: string,
): Promise<void> {
  if (replyToId) {
    await channel.send({
      content,
      reply: {
        messageReference: replyToId,
        failIfNotExists: false,
      },
      allowedMentions: { repliedUser: false },
    });
    return;
  }
  await channel.send({ content });
}

function chunkDiscordText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim().length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const line of lines) {
    if (!line) {
      if (current.length + 1 > limit) {
        push();
      }
      current += "\n";
      continue;
    }

    if (line.length > limit) {
      if (current) push();
      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit));
      }
      continue;
    }

    const separator = current ? "\n" : "";
    if (current.length + separator.length + line.length > limit) {
      push();
    }
    current += (current ? "\n" : "") + line;
  }

  push();
  return chunks.length > 0 ? chunks : [text];
}
