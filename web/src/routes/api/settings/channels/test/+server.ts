import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSettingsForUser } from "$lib/server/settings";

const MASKED_SECRET = "••••••";
const SUPPORTED_CHANNELS = ["discord", "feishu"] as const;

type SupportedChannel = (typeof SUPPORTED_CHANNELS)[number];

type ChannelConfig = Record<string, string>;

interface ChannelTestRequest {
  channelId?: string;
  config?: ChannelConfig;
}

/**
 * Merge edited config values with stored config, preserving masked secrets from persisted settings.
 */
function mergeConfigWithSaved(
  savedConfig: ChannelConfig,
  incomingConfig: ChannelConfig,
): ChannelConfig {
  const merged: ChannelConfig = { ...savedConfig };

  for (const [key, value] of Object.entries(incomingConfig)) {
    if (typeof value !== "string") continue;

    if (value === MASKED_SECRET) {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      delete merged[key];
      continue;
    }

    merged[key] = trimmed;
  }

  return merged;
}

/** Validate Discord bot token by calling Discord's current-user endpoint. */
async function testDiscord(config: ChannelConfig): Promise<string> {
  const botToken = config.botToken?.trim();
  if (!botToken) {
    throw new Error("Discord bot token is required.");
  }

  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail =
      typeof payload?.message === "string"
        ? payload.message
        : "Discord rejected the credentials.";
    throw new Error(`Discord test failed: ${detail}`);
  }

  const user = (await response.json()) as { username?: string };
  return user.username
    ? `Connected as Discord bot @${user.username}.`
    : "Discord credentials are valid.";
}

/** Validate Feishu credentials by requesting a tenant access token. */
async function testFeishu(config: ChannelConfig): Promise<string> {
  const appId = config.appId?.trim();
  const appSecret = config.appSecret?.trim();

  if (!appId || !appSecret) {
    throw new Error("Feishu App ID and App secret are required.");
  }

  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error("Feishu test failed: unable to reach Feishu auth endpoint.");
  }

  const payload = (await response.json()) as {
    code?: number;
    msg?: string;
  };

  if (payload.code !== 0) {
    throw new Error(`Feishu test failed: ${payload.msg || "invalid credentials"}`);
  }

  return "Feishu credentials are valid.";
}

/**
 * POST /api/settings/channels/test
 * Validates channel credentials without saving settings.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ChannelTestRequest;
    const channelId = body.channelId as SupportedChannel;

    if (!SUPPORTED_CHANNELS.includes(channelId)) {
      return json({ error: "Unsupported channel" }, { status: 400 });
    }

    const incomingConfig =
      body.config && typeof body.config === "object" ? body.config : {};

    const settings = await getSettingsForUser(locals.user.id);
    const savedConfig = settings.channelIntegrations[channelId]?.config ?? {};
    const mergedConfig = mergeConfigWithSaved(savedConfig, incomingConfig);

    let message = "Credentials are valid.";
    if (channelId === "discord") {
      message = await testDiscord(mergedConfig);
    }

    if (channelId === "feishu") {
      message = await testFeishu(mergedConfig);
    }

    return json({ ok: true, message });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Channel test request failed";
    return json({ error: message }, { status: 400 });
  }
};
