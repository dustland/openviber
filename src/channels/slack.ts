/**
 * Slack Channel Implementation
 *
 * This implementation uses the @slack/bolt framework to handle
 * Socket Mode connections, which do not require a public IP address.
 *
 * NOTE: This is a skeleton implementation. To enable full functionality:
 * 1. pnpm add @slack/bolt
 * 2. Uncomment the implementation code below.
 */

import { Channel, ChannelRuntimeContext, InboundMessage, AgentStreamEvent, SlackConfig } from "./channel";

export class SlackChannel implements Channel {
  id = "slack";
  type = "websocket" as const;
  private app: any; // Type as 'App' from @slack/bolt when installed

  constructor(private config: SlackConfig, private context: ChannelRuntimeContext) {
    // Lazy load dependencies to avoid runtime errors if not installed
    // this.initialize();
  }

  private async initialize() {
    try {
      // Dynamic import to avoid build errors if dependency is missing
      const { App } = await import("@slack/bolt" as any);

      this.app = new App({
        token: this.config.botToken,
        appToken: this.config.appToken,
        signingSecret: this.config.signingSecret,
        socketMode: true,
      });

      // Register event handlers
      this.app.message(async ({ message, say }: any) => {
        if (message.subtype && message.subtype !== "file_share") return;
        if (message.bot_id) return; // Ignore bots

        const text = message.text || "";
        const userId = message.user;
        const channelId = message.channel;

        // Convert to standard InboundMessage
        const inbound: InboundMessage = {
          id: message.ts,
          source: "slack",
          userId,
          conversationId: channelId,
          content: text,
          metadata: {
            threadId: message.thread_ts,
          }
        };

        await this.context.routeMessage(inbound);
      });

      console.log("[Slack] Initialized Bolt app");
    } catch (error) {
      console.warn("[Slack] Failed to initialize. Install @slack/bolt to enable.");
    }
  }

  async start(): Promise<void> {
    console.log("[Slack] Starting Slack channel (Socket Mode)...");
    if (!this.app) {
        // Try to initialize one last time
        await this.initialize();
    }

    if (this.app) {
        await this.app.start();
        console.log("[Slack] Connected!");
    } else {
        console.log("[Slack] (Skeleton) Slack integration requires @slack/bolt dependency. Skipping start.");
    }
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      console.log("[Slack] Stopped.");
    }
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    // This method is usually for webhook-based channels.
    // For Socket Mode, the internal listener handles it.
  }

  private messageBuffers = new Map<string, string>();

  async stream(conversationId: string, event: AgentStreamEvent): Promise<void> {
    if (!this.app) return;

    try {
      if (event.type === "text-delta" && event.content) {
        const current = this.messageBuffers.get(conversationId) || "";
        this.messageBuffers.set(conversationId, current + event.content);
      } else if (event.type === "done") {
        const text = this.messageBuffers.get(conversationId);
        if (text) {
          await this.app.client.chat.postMessage({ channel: conversationId, text });
          this.messageBuffers.delete(conversationId);
        }
      }
    } catch (error) {
      console.error("[Slack] Failed to send message:", error);
    }
  }
}
