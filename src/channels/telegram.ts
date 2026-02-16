import { Telegraf, Context } from "telegraf";
import {
  Channel,
  ChannelRuntimeContext,
  InboundMessage,
  AgentStreamEvent,
  TelegramConfig,
  InterruptSignal,
} from "./channel";
import { chunkForChannel } from "./chunk";

export class TelegramChannel implements Channel {
  readonly id = "telegram";
  readonly type = "websocket"; // Polling mode

  private bot: Telegraf;
  private isRunning = false;
  private responseBuffers = new Map<string, string>(); // conversationId -> text

  constructor(
    private config: TelegramConfig,
    private context: ChannelRuntimeContext,
  ) {
    this.bot = new Telegraf(config.botToken);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.on("text", async (ctx) => {
      await this.handleTelegramMessage(ctx);
    });
  }

  private async handleTelegramMessage(ctx: Context) {
    if (!ctx.message || !("text" in ctx.message)) return;

    const userId = ctx.from?.id.toString();
    if (!userId) return;

    // Security check
    if (
      this.config.allowUserIds &&
      this.config.allowUserIds.length > 0 &&
      !this.config.allowUserIds.includes(userId)
    ) {
      console.warn(
        `[Telegram] Blocked message from unauthorized user: ${userId}`,
      );
      return;
    }

    const conversationId = ctx.chat?.id.toString();
    if (!conversationId) return;

    // Clear buffer for new turn
    this.responseBuffers.delete(conversationId);

    const inbound: InboundMessage = {
      id: ctx.message.message_id.toString(),
      source: "telegram",
      userId: userId,
      conversationId: conversationId,
      content: ctx.message.text,
      metadata: {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        chatType: ctx.chat?.type,
      },
    };

    await this.handleMessage(inbound);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    console.log("[Telegram] Starting polling...");
    // launch() returns a promise that resolves when the bot stops, so we don't await it.
    this.bot.launch().catch((err) => {
      console.error("[Telegram] Failed to launch bot:", err);
    });
    console.log("[Telegram] Bot started");

    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.bot.stop("SIGINT");
    this.isRunning = false;
    console.log("[Telegram] Channel stopped");
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    await this.context.routeMessage(message);
  }

  async handleInterrupt(signal: InterruptSignal): Promise<void> {
    await this.context.handleInterrupt(signal);
  }

  async stream(conversationId: string, event: AgentStreamEvent): Promise<void> {
    const chatId = conversationId;

    try {
      if (event.type === "text-delta") {
        const current = this.responseBuffers.get(conversationId) || "";
        this.responseBuffers.set(conversationId, current + event.content);
        return;
      }

      if (event.type === "done") {
        const text = this.responseBuffers.get(conversationId);
        if (text) {
          await this.sendTelegramMessage(chatId, text);
          this.responseBuffers.delete(conversationId);
        }
        return;
      }

      if (event.type === "error") {
        await this.bot.telegram.sendMessage(chatId, `❌ Error: ${event.error}`);
        this.responseBuffers.delete(conversationId);
      }

      if (event.type === "tool-call") {
        // Optional: Notify user about tool usage
        // await this.bot.telegram.sendMessage(chatId, `🛠️ Using tool: ${event.tool}`);
      }
    } catch (error) {
      console.error(`[Telegram] Error streaming to ${chatId}:`, error);
    }
  }

  private async sendTelegramMessage(
    chatId: string,
    text: string,
  ): Promise<void> {
    const chunks = chunkForChannel(text, "telegram");
    for (const chunk of chunks) {
      await this.bot.telegram.sendMessage(chatId, chunk);
    }
  }
}
