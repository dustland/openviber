/**
 * Command Center Channels
 *
 * Export all channels and the manager for integrating
 * external command centers with Viber runtime.
 */

// Core types and interface
export * from "./channel";

// Channel manager
export { ChannelManager, channelManager } from "./manager";

// Built-in channels
export { DingTalkChannel } from "./dingtalk";
export { WeComChannel } from "./wecom";
export { WeChatChannel } from "./wechat";
export { WebChannel, webChannel } from "./web";
export { DiscordChannel } from "./discord";
export { FeishuChannel } from "./feishu";

// Gateway utilities
export { ChannelGateway } from "./gateway";
export { loadGatewayBootstrapConfig } from "./config";
export { registerBuiltinChannels, createChannelsFromConfig } from "./builtin";
export { channelRegistry, ChannelRegistry } from "./registry";
