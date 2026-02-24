import { App } from "@slack/bolt";
import {
  Channel,
  ChannelRuntimeContext,
  InboundMessage,
  AgentStreamEvent,
  SlackConfig,
  InterruptSignal,
} from "./channel";

export class SlackChannel implements Channel {
  readonly id = "slack";
  readonly type = "websocket"; // Socket Mode

  private app: App | null = null;
  private responseBuffers = new Map<string, string>(); // conversationId -> text
  private botUserId: string | null = null;

  constructor(
    private config: SlackConfig,
    private context: ChannelRuntimeContext,
  ) { }

  async start(): Promise<void> {
    if (this.app) return;

    console.log("[Slack] Starting Socket Mode...");

    this.app = new App({
      token: this.config.botToken,
      appToken: this.config.appToken,
      socketMode: true,
      signingSecret: this.config.signingSecret, // Optional for Socket Mode but good practice
    });

    // Fetch bot user ID for mention checking
    const authTest = await this.app.client.auth.test();
    this.botUserId = authTest.user_id as string;

    this.setupHandlers();

    await this.app.start();
    console.log("[Slack] Connected as", authTest.user);
  }

  async stop(): Promise<void> {
    if (!this.app) return;
    await this.app.stop();
    this.app = null;
    this.responseBuffers.clear();
    console.log("[Slack] Channel stopped");
  }

  private setupHandlers() {
    if (!this.app) return;

    this.app.message(async ({ message, say }) => {
      // Ignore subtype messages (like channel_join, etc.) unless they are file shares which we might want later
      if (message.subtype && message.subtype !== "file_share") return;

      // Ignore bot messages
      if ((message as any).bot_id) return;

      const text = (message as any).text || "";
      const channelId = message.channel;
      const userId = (message as any).user;
      const channelType = (message as any).channel_type; // 'im', 'channel', 'group', 'mpim'

      // Check allowChannelIds
      if (
        this.config.allowChannelIds &&
        this.config.allowChannelIds.length > 0 &&
        !this.config.allowChannelIds.includes(channelId)
      ) {
        return;
      }

      // Group policy check
      const isGroup = channelType === "channel" || channelType === "group" || channelType === "mpim";
      if (isGroup) {
        const policy = this.config.groupPolicy || "mention";
        if (policy === "mention") {
          // Check if bot is mentioned
          if (!text.includes(`<@${this.botUserId}>`)) {
            return;
          }
        }
      }

      // Prepare inbound message
      const inbound: InboundMessage = {
        id: (message as any).ts,
        source: "slack",
        userId: userId,
        conversationId: channelId,
        content: this.stripBotMention(text),
        metadata: {
          channelType,
          threadTs: (message as any).thread_ts,
        },
      };

      await this.handleMessage(inbound);
    });
  }

  private stripBotMention(text: string): string {
    if (!this.botUserId) return text;
    const regex = new RegExp(`<@${this.botUserId}>`, "g");
    return text.replace(regex, "").trim();
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    // Clear buffer for new turn
    this.responseBuffers.delete(message.conversationId);
    await this.context.routeMessage(message);
  }

  async handleInterrupt(signal: InterruptSignal): Promise<void> {
    await this.context.handleInterrupt(signal);
  }

  async stream(conversationId: string, event: AgentStreamEvent): Promise<void> {
    const channelId = conversationId;

    try {
      if (event.type === "text-delta") {
        const current = this.responseBuffers.get(conversationId) || "";
        this.responseBuffers.set(conversationId, current + event.content);
        return;
      }

      if (event.type === "done") {
        const text = this.responseBuffers.get(conversationId);
        if (text) {
          await this.sendSlackMessage(channelId, text);
          this.responseBuffers.delete(conversationId);
        }
        return;
      }

      if (event.type === "error") {
        if (this.app) {
          await this.app.client.chat.postMessage({
            channel: channelId,
            text: `❌ Error: ${event.error}`,
          });
        }
        this.responseBuffers.delete(conversationId);
      }
    } catch (error) {
      console.error(`[Slack] Error streaming to ${channelId}:`, error);
    }
  }

  private async sendSlackMessage(
    channelId: string,
    text: string,
  ): Promise<void> {
    if (!this.app) return;
    try {
        await this.app.client.chat.postMessage({
            channel: channelId,
            text: text,
        });
    } catch (err) {
        console.error(`[Slack] Failed to send message to ${channelId}`, err);
    }
  }
}
