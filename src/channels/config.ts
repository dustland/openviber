import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as YAML from "yaml";
import type { ChannelsConfig } from "./channel";
import type { ChannelGatewayConfig } from "./gateway";

export type GatewayConfigSource = "remote" | "local" | "env" | "default";

export interface GatewayBootstrapConfig {
  gateway: ChannelGatewayConfig;
  channels: ChannelsConfig;
  source: GatewayConfigSource;
}

interface SavedCliConfig {
  mode?: string;
  viberId?: string;
  name?: string;
  gatewayUrl?: string;
  /** @deprecated Use gatewayUrl instead */
  boardUrl?: string;
  /** @deprecated Use gatewayUrl instead */
  hubUrl?: string;
  authToken?: string;
  webUrl?: string;
  onboardedAt?: string;
}

const DEFAULT_GATEWAY: ChannelGatewayConfig = {
  host: "0.0.0.0",
  port: 6009,
  basePath: "",
};

const CONFIG_FILE = path.join(os.homedir(), ".openviber", "config.yaml");

/**
 * Resolve gateway and channel configuration from web, local file, or env.
 */
export async function loadGatewayBootstrapConfig(
  overrides: Partial<ChannelGatewayConfig> = {},
): Promise<GatewayBootstrapConfig> {
  const remote = await loadRemoteNodeConfig();
  if (remote) {
    return {
      gateway: mergeGatewayConfig(remote.gateway, overrides),
      channels: remote.channels ?? {},
      source: "remote",
    };
  }

  const local = await loadLocalConfig();
  if (local) {
    return {
      gateway: mergeGatewayConfig(local.gateway, overrides),
      channels: local.channels ?? {},
      source: "local",
    };
  }

  const envChannels = loadEnvChannels();
  if (Object.keys(envChannels).length > 0) {
    return {
      gateway: mergeGatewayConfig(undefined, overrides),
      channels: envChannels,
      source: "env",
    };
  }

  return {
    gateway: mergeGatewayConfig(undefined, overrides),
    channels: {},
    source: "default",
  };
}

function mergeGatewayConfig(
  base?: Partial<ChannelGatewayConfig>,
  overrides?: Partial<ChannelGatewayConfig>,
): ChannelGatewayConfig {
  return {
    host: overrides?.host || base?.host || DEFAULT_GATEWAY.host,
    port: overrides?.port || base?.port || DEFAULT_GATEWAY.port,
    basePath: overrides?.basePath ?? base?.basePath ?? DEFAULT_GATEWAY.basePath,
  };
}

async function loadRemoteNodeConfig(): Promise<{
  gateway?: Partial<ChannelGatewayConfig>;
  channels?: ChannelsConfig;
} | null> {
  const saved = await loadSavedCliConfig();
  if (!saved?.webUrl || !saved?.authToken || !saved?.viberId) {
    return null;
  }

  try {
    const url = `${saved.webUrl.replace(/\/$/, "")}/api/vibers/${saved.viberId}/config`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${saved.authToken}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as any;
    const config = payload?.config;
    if (!config || typeof config !== "object") return null;
    return {
      gateway: config.gateway ?? undefined,
      channels: config.channels ?? undefined,
    };
  } catch {
    return null;
  }
}

async function loadLocalConfig(): Promise<{
  gateway?: Partial<ChannelGatewayConfig>;
  channels?: ChannelsConfig;
} | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = YAML.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!("gateway" in parsed) && !("channels" in parsed)) {
      return null;
    }
    return {
      gateway: parsed.gateway ?? undefined,
      channels: parsed.channels ?? undefined,
    };
  } catch {
    return null;
  }
}

async function loadSavedCliConfig(): Promise<SavedCliConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = YAML.parse(raw) as SavedCliConfig;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function loadEnvChannels(): ChannelsConfig {
  const channels: ChannelsConfig = {};

  if (process.env.DINGTALK_APP_KEY && process.env.DINGTALK_APP_SECRET) {
    channels.dingtalk = {
      enabled: true,
      appKey: process.env.DINGTALK_APP_KEY,
      appSecret: process.env.DINGTALK_APP_SECRET,
      robotCode: process.env.DINGTALK_ROBOT_CODE,
    };
  }

  if (
    process.env.WECOM_CORP_ID &&
    process.env.WECOM_AGENT_SECRET &&
    process.env.WECOM_TOKEN &&
    process.env.WECOM_ENCODING_AES_KEY
  ) {
    channels.wecom = {
      enabled: true,
      corpId: process.env.WECOM_CORP_ID,
      agentId: process.env.WECOM_AGENT_ID || "0",
      secret: process.env.WECOM_AGENT_SECRET,
      token: process.env.WECOM_TOKEN,
      aesKey: process.env.WECOM_ENCODING_AES_KEY,
    };
  }


  if (process.env.WECHAT_API_KEY && process.env.WECHAT_PROXY_URL) {
    channels.wechat = {
      enabled: true,
      apiKey: process.env.WECHAT_API_KEY,
      proxyUrl: process.env.WECHAT_PROXY_URL,
      accountId: process.env.WECHAT_ACCOUNT_ID,
    };
  }

  if (process.env.DISCORD_BOT_TOKEN) {
    channels.discord = {
      enabled: true,
      botToken: process.env.DISCORD_BOT_TOKEN,
      appId: process.env.DISCORD_APP_ID,
      allowGuildIds: splitList(process.env.DISCORD_ALLOW_GUILDS),
      allowChannelIds: splitList(process.env.DISCORD_ALLOW_CHANNELS),
      allowUserIds: splitList(process.env.DISCORD_ALLOW_USERS),
      requireMention: parseBool(process.env.DISCORD_REQUIRE_MENTION, true),
      replyMode: (process.env.DISCORD_REPLY_MODE as "reply" | "channel") || undefined,
    };
  }

  if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
    channels.feishu = {
      enabled: true,
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
      verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
      encryptKey: process.env.FEISHU_ENCRYPT_KEY,
      domain: process.env.FEISHU_DOMAIN,
      connectionMode: (process.env.FEISHU_CONNECTION_MODE as
        | "websocket"
        | "webhook") ?? "websocket",
      webhookPath: process.env.FEISHU_WEBHOOK_PATH,
      allowGroupMessages: parseBool(process.env.FEISHU_ALLOW_GROUPS, false),
      requireMention: parseBool(process.env.FEISHU_REQUIRE_MENTION, true),
    };
  }

  return channels;
}

function splitList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}
