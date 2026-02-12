import { Command } from "commander";
import type { ChannelRuntimeContext, InboundMessage, InterruptSignal } from "../../channels/channel";

export const channelsCommand = new Command("channels")
  .description("Start the enterprise channel server (DingTalk, WeCom, Discord, Feishu webhooks)")
  .option("-p, --port <port>", "Channel server port", "6009")
  .action(async (options) => {
    const { channelManager } = await import("../../channels/manager");
    const { ChannelGateway } = await import("../../channels/gateway");
    const { loadGatewayBootstrapConfig } = await import("../../channels/config");
    const {
      registerBuiltinChannels,
      createChannelsFromConfig,
    } = await import("../../channels/builtin");

    console.log(`
+-------------------------------------------------------+
|                  CHANNELS STARTING                      |
+-------------------------------------------------------+
`);

    const bootstrap = await loadGatewayBootstrapConfig({
      port: parseInt(options.port, 10),
    });

    registerBuiltinChannels();

    const context: ChannelRuntimeContext = {
      routeMessage: (message: InboundMessage) => channelManager.routeMessage(message),
      handleInterrupt: (signal: InterruptSignal) => channelManager.handleInterrupt(signal),
    };

    const channelInstances = createChannelsFromConfig(bootstrap.channels, context);
    const channelNames = channelInstances.map((channel) => channel.id);

    if (channelInstances.length === 0) {
      console.log(`
No channels configured. Set environment variables to enable channels:

DingTalk:
  DINGTALK_APP_KEY, DINGTALK_APP_SECRET, DINGTALK_ROBOT_CODE

WeCom:
  WECOM_CORP_ID, WECOM_AGENT_ID, WECOM_AGENT_SECRET
  WECOM_TOKEN, WECOM_ENCODING_AES_KEY (optional)

Discord:
  DISCORD_BOT_TOKEN (optional: DISCORD_APP_ID, DISCORD_ALLOW_GUILDS, DISCORD_ALLOW_CHANNELS)

Feishu:
  FEISHU_APP_ID, FEISHU_APP_SECRET (optional: FEISHU_VERIFICATION_TOKEN, FEISHU_DOMAIN)

Or configure channels from the OpenViber web and re-run: viber channels
`);
      process.exit(1);
    }

    const gateway = new ChannelGateway(bootstrap.gateway, channelInstances, channelManager);

    await gateway.start();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n[Channels] Shutting down...");
      await gateway.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n[Channels] Shutting down...");
      await gateway.stop();
      process.exit(0);
    });

    const basePath = bootstrap.gateway.basePath || "/";

    console.log(`
+-------------------------------------------------------+
|                  CHANNELS RUNNING                        |
+-------------------------------------------------------+
| Channels:     ${channelNames.join(", ").slice(0, 43).padEnd(43)} |
| Webhooks:     ${`${bootstrap.gateway.host}:${bootstrap.gateway.port}${basePath}`.slice(0, 43).padEnd(43)} |
| Status:       * Ready                                     |
+-------------------------------------------------------+

Listening for messages from enterprise channels...
Press Ctrl+C to stop.
`);
  });
