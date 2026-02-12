import type { Channel, ChannelRuntimeContext, ChannelsConfig } from "./channel";
import { DingTalkChannel } from "./dingtalk";
import { WeComChannel } from "./wecom";
import { WebChannel } from "./web";
import { DiscordChannel } from "./discord";
import { FeishuChannel } from "./feishu";
import { channelRegistry } from "./registry";

/**
 * Register the built-in channel factories.
 */
export function registerBuiltinChannels(): void {
  if (!channelRegistry.get("dingtalk")) {
    channelRegistry.register({
      id: "dingtalk",
      displayName: "DingTalk",
      description: "DingTalk enterprise bot integration",
      create: (config, context) => new DingTalkChannel(config as any, context),
    });
  }

  if (!channelRegistry.get("wecom")) {
    channelRegistry.register({
      id: "wecom",
      displayName: "WeCom",
      description: "WeCom (WeChat Work) enterprise integration",
      create: (config, context) => new WeComChannel(config as any, context),
    });
  }

  if (!channelRegistry.get("web")) {
    channelRegistry.register({
      id: "web",
      displayName: "Web",
      description: "Local web channel (SSE)",
      create: (config, _context) => new WebChannel(config as any),
    });
  }

  if (!channelRegistry.get("discord")) {
    channelRegistry.register({
      id: "discord",
      displayName: "Discord",
      description: "Discord bot integration via gateway",
      create: (config, context) => new DiscordChannel(config as any, context),
    });
  }

  if (!channelRegistry.get("feishu")) {
    channelRegistry.register({
      id: "feishu",
      displayName: "Feishu",
      description: "Feishu/Lark bot integration",
      create: (config, context) => new FeishuChannel(config as any, context),
    });
  }
}

/**
 * Create channel instances for enabled configs.
 */
export function createChannelsFromConfig(
  config: ChannelsConfig,
  context: ChannelRuntimeContext,
): Channel[] {
  const channels: Channel[] = [];
  for (const [id, cfg] of Object.entries(config)) {
    if (!cfg || cfg.enabled === false) continue;
    const factory = channelRegistry.get(id);
    if (!factory) {
      console.warn(`[Gateway] Unknown channel "${id}" - skipping`);
      continue;
    }
    channels.push(factory.create(cfg as any, context));
  }
  return channels;
}
