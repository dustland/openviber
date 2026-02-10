import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getSettingsForUser,
  type UserSettings,
  type SkillSourceSetting as ServerSkillSourceSetting,
  type ChannelIntegrationSetting as ServerChannelIntegrationSetting,
  type AiProviderSetting as ServerAiProviderSetting,
} from "$lib/server/user-settings";
import { supabaseRequest } from "$lib/server/supabase-rest";

/** Canonical coding CLI skill IDs (must match src/skills/hub/settings.ts). */
const CODING_CLI_SKILL_IDS = ["codex-cli", "cursor-agent", "gemini-cli"] as const;

/** Options for the primary coding CLI dropdown. */
const CODING_CLI_OPTIONS: { id: string; label: string }[] = [
  { id: "codex-cli", label: "Codex CLI" },
  { id: "cursor-agent", label: "Cursor Agent" },
  { id: "gemini-cli", label: "Gemini CLI" },
];

const MASKED_SECRET = "••••••";

/** All known skill source provider keys */
const ALL_PROVIDERS = [
  "openclaw",
  "github",
  "npm",
  "huggingface",
  "smithery",
  "composio",
  "glama",
] as const;

/** Display metadata for each provider */
const PROVIDER_META: Record<
  string,
  {
    displayName: string;
    description: string;
    defaultUrl: string;
    urlLabel: string;
    apiKeyLabel: string;
    apiKeyEnvVar: string;
    docsUrl: string;
  }
> = {
  openclaw: {
    displayName: "OpenClaw Skill Hub",
    description: "Community-curated skill registry for OpenViber agents",
    defaultUrl: "https://hub.openclaw.org/api/v1",
    urlLabel: "Hub API URL",
    apiKeyLabel: "",
    apiKeyEnvVar: "",
    docsUrl: "https://hub.openclaw.org",
  },
  github: {
    displayName: "GitHub",
    description:
      "Import skills from GitHub repositories tagged with openviber-skill topic",
    defaultUrl: "https://api.github.com",
    urlLabel: "GitHub API URL",
    apiKeyLabel: "GitHub Token",
    apiKeyEnvVar: "GITHUB_TOKEN",
    docsUrl: "https://github.com/topics/openviber-skill",
  },
  npm: {
    displayName: "npm Registry",
    description:
      "npm packages with the openviber-skill keyword",
    defaultUrl: "https://registry.npmjs.org",
    urlLabel: "npm Registry URL",
    apiKeyLabel: "",
    apiKeyEnvVar: "",
    docsUrl: "https://www.npmjs.com/search?q=keywords:openviber-skill",
  },
  huggingface: {
    displayName: "Hugging Face",
    description:
      "Models and spaces on Hugging Face tagged with openviber-skill",
    defaultUrl: "https://huggingface.co/api",
    urlLabel: "HF API URL",
    apiKeyLabel: "HF Token",
    apiKeyEnvVar: "HUGGINGFACE_TOKEN",
    docsUrl: "https://huggingface.co",
  },
  smithery: {
    displayName: "Smithery (MCP)",
    description:
      "MCP server registry — discover Model Context Protocol tools",
    defaultUrl: "https://registry.smithery.ai",
    urlLabel: "Registry URL",
    apiKeyLabel: "",
    apiKeyEnvVar: "",
    docsUrl: "https://smithery.ai",
  },
  composio: {
    displayName: "Composio",
    description:
      "250+ SaaS integrations (GitHub, Slack, Google, etc.) as agent tools",
    defaultUrl: "https://backend.composio.dev/api/v2",
    urlLabel: "API URL",
    apiKeyLabel: "API Key",
    apiKeyEnvVar: "COMPOSIO_API_KEY",
    docsUrl: "https://composio.dev",
  },
  glama: {
    displayName: "Glama (MCP)",
    description:
      "Curated directory of MCP servers for AI agents",
    defaultUrl: "https://glama.ai/api/mcp",
    urlLabel: "API URL",
    apiKeyLabel: "",
    apiKeyEnvVar: "",
    docsUrl: "https://glama.ai/mcp/servers",
  },
};

/** AI provider keys in display order */
const ALL_AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "openrouter",
] as const;

/** Display metadata for AI providers */
const AI_PROVIDER_META: Record<
  string,
  {
    displayName: string;
    description: string;
    apiKeyPlaceholder: string;
    apiKeyEnvVar: string;
    docsUrl: string;
    defaultBaseUrl: string;
  }
> = {
  openai: {
    displayName: "OpenAI",
    description: "GPT-4o, o3, o4-mini and other OpenAI models",
    apiKeyPlaceholder: "sk-...",
    apiKeyEnvVar: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    displayName: "Anthropic",
    description: "Claude Sonnet, Haiku, and Opus models",
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    docsUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com",
  },
  google: {
    displayName: "Google (Gemini)",
    description: "Gemini 2.5 Pro, Flash and other Google AI models",
    apiKeyPlaceholder: "AIza...",
    apiKeyEnvVar: "GOOGLE_API_KEY",
    docsUrl: "https://aistudio.google.com/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
  },
  deepseek: {
    displayName: "DeepSeek",
    description: "DeepSeek V3, R1 reasoning model",
    apiKeyPlaceholder: "sk-...",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    docsUrl: "https://platform.deepseek.com/api_keys",
    defaultBaseUrl: "https://api.deepseek.com",
  },
  openrouter: {
    displayName: "OpenRouter",
    description: "Unified gateway to 200+ models from multiple providers",
    apiKeyPlaceholder: "sk-or-...",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    docsUrl: "https://openrouter.ai/keys",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
};

const ALL_CHANNELS = ["discord", "feishu"] as const;

interface ChannelFieldMeta {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  secret?: boolean;
  type?: "text" | "password" | "url";
}

const CHANNEL_META: Record<
  string,
  {
    displayName: string;
    description: string;
    docsUrl: string;
    fields: ChannelFieldMeta[];
  }
> = {
  discord: {
    displayName: "Discord",
    description:
      "Connect a Discord bot to receive tasks and send agent responses.",
    docsUrl: "https://discord.com/developers/docs/intro",
    fields: [
      {
        key: "botToken",
        label: "Bot token",
        placeholder: "Paste your Discord bot token",
        secret: true,
        type: "password",
      },
      {
        key: "guildId",
        label: "Server (guild) ID",
        placeholder: "123456789012345678",
      },
      {
        key: "channelId",
        label: "Default channel ID",
        placeholder: "123456789012345678",
        help: "Where new viber conversations should post by default.",
      },
    ],
  },
  feishu: {
    displayName: "Feishu (Lark)",
    description:
      "Connect a Feishu app to sync conversations with Feishu group chats.",
    docsUrl: "https://open.feishu.cn/document/home/index",
    fields: [
      {
        key: "appId",
        label: "App ID",
        placeholder: "cli_9f0bxxxx",
      },
      {
        key: "appSecret",
        label: "App secret",
        placeholder: "Paste your app secret",
        secret: true,
        type: "password",
      },
      {
        key: "verificationToken",
        label: "Verification token",
        placeholder: "Paste the verification token",
        secret: true,
        type: "password",
      },
      {
        key: "encryptKey",
        label: "Encrypt key",
        placeholder: "Paste the encrypt key",
        secret: true,
        type: "password",
      },
    ],
  },
};

interface SkillSourceSetting {
  enabled: boolean;
  url?: string;
  apiKey?: string;
}

function getDefaultSources(): Record<string, SkillSourceSetting> {
  return {
    openclaw: { enabled: true },
    github: { enabled: true },
    npm: { enabled: true },
    huggingface: { enabled: true },
    smithery: { enabled: true },
    composio: { enabled: false },
    glama: { enabled: true },
  };
}

/**
 * GET /api/settings
 * Returns the current settings from Supabase (single source of truth) + provider metadata for the UI.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings: UserSettings = await getSettingsForUser(locals.user.id);
  const defaults = getDefaultSources();

  // Merge saved settings with defaults
  const sources: Record<
    string,
    SkillSourceSetting & {
      displayName: string;
      description: string;
      defaultUrl: string;
      urlLabel: string;
      apiKeyLabel: string;
      apiKeyEnvVar: string;
      docsUrl: string;
    }
  > = {};

  for (const key of ALL_PROVIDERS) {
    const saved = settings.skillSources[key] as ServerSkillSourceSetting | undefined;
    const def = defaults[key] || { enabled: false };
    const meta = PROVIDER_META[key] || {
      displayName: key,
      description: "",
      defaultUrl: "",
      urlLabel: "URL",
      apiKeyLabel: "",
      apiKeyEnvVar: "",
      docsUrl: "",
    };

    sources[key] = {
      enabled: saved?.enabled ?? def.enabled,
      url: saved?.url || undefined,
      apiKey: saved?.apiKey ? MASKED_SECRET : undefined, // Mask API key
      ...meta,
    };
  }

  const channels: Record<
    string,
    ServerChannelIntegrationSetting & {
      displayName: string;
      description: string;
      docsUrl: string;
      fields: ChannelFieldMeta[];
      config: Record<string, string>;
    }
  > = {};

  for (const channelId of ALL_CHANNELS) {
    const saved = settings.channelIntegrations[channelId];
    const meta = CHANNEL_META[channelId] || {
      displayName: channelId,
      description: "",
      docsUrl: "",
      fields: [],
    };
    const config: Record<string, string> = {};

    for (const field of meta.fields) {
      const storedValue = saved?.config?.[field.key];
      if (storedValue) {
        config[field.key] = field.secret ? MASKED_SECRET : storedValue;
      } else {
        config[field.key] = "";
      }
    }

    channels[channelId] = {
      enabled: saved?.enabled ?? false,
      config,
      ...meta,
    };
  }

  // AI providers
  const aiProviders: Record<
    string,
    {
      apiKey: string;
      baseUrl: string;
      displayName: string;
      description: string;
      apiKeyPlaceholder: string;
      apiKeyEnvVar: string;
      docsUrl: string;
      defaultBaseUrl: string;
    }
  > = {};

  for (const key of ALL_AI_PROVIDERS) {
    const saved = settings.aiProviders[key];
    const meta = AI_PROVIDER_META[key];
    aiProviders[key] = {
      apiKey: saved?.apiKey ? MASKED_SECRET : "",
      baseUrl: saved?.baseUrl || "",
      ...meta,
    };
  }

  return json({
    sources,
    channels,
    aiProviders,
    primaryCodingCli: settings.primaryCodingCli ?? null,
    chatModel: settings.chatModel ?? null,
    timezone: settings.timezone ?? null,
    codingCliOptions: CODING_CLI_OPTIONS,
  });
};

interface UserSettingsRow {
  id: string;
  user_id: string;
  skill_sources: Record<string, SkillSourceSetting>;
  channel_integrations: Record<string, ServerChannelIntegrationSetting>;
  primary_coding_cli: string | null;
  chat_model: string | null;
  ai_providers: Record<string, ServerAiProviderSetting>;
  timezone: string | null;
}

/**
 * PUT /api/settings
 * Update skill source settings in Supabase (single source of truth).
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const payload = body as {
      sources?: Record<string, Partial<SkillSourceSetting>>;
      channels?: Record<string, Partial<ServerChannelIntegrationSetting>>;
      aiProviders?: Record<string, Partial<ServerAiProviderSetting>>;
      primaryCodingCli?: string | null;
      chatModel?: string | null;
      timezone?: string | null;
    };
    const {
      sources,
      channels,
      aiProviders: aiProvidersPayload,
      primaryCodingCli: primaryCodingCliPayload,
      chatModel: chatModelPayload,
      timezone: timezonePayload,
    } = payload;

    const userId = locals.user.id;

    // Load current from Supabase
    const current = await getSettingsForUser(userId);
    let skillSources = { ...current.skillSources };
    let channelIntegrations = { ...current.channelIntegrations };
    let aiProviders = { ...current.aiProviders };
    let primaryCodingCli: string | null = current.primaryCodingCli;
    let chatModel: string | null = current.chatModel;
    let timezone: string | null = current.timezone;

    if (sources && typeof sources === "object") {
      for (const key of ALL_PROVIDERS) {
        const update = sources[key];
        if (!update) continue;

        if (!skillSources[key]) {
          skillSources[key] = { enabled: false };
        }

        if (typeof update.enabled === "boolean") {
          skillSources[key] = { ...skillSources[key], enabled: update.enabled };
        }
        if (typeof update.url === "string") {
          skillSources[key] = { ...skillSources[key], url: update.url || undefined };
        }
        if (typeof update.apiKey === "string" && update.apiKey !== MASKED_SECRET) {
          skillSources[key] = { ...skillSources[key], apiKey: update.apiKey || undefined };
        }
      }
    }

    if (channels && typeof channels === "object") {
      for (const channelId of ALL_CHANNELS) {
        const update = channels[channelId];
        if (!update) continue;

        if (!channelIntegrations[channelId]) {
          channelIntegrations[channelId] = { enabled: false };
        }

        if (typeof update.enabled === "boolean") {
          channelIntegrations[channelId] = {
            ...channelIntegrations[channelId],
            enabled: update.enabled,
          };
        }

        if (update.config && typeof update.config === "object") {
          const meta = CHANNEL_META[channelId];
          const allowedKeys = new Set(meta?.fields.map((field) => field.key) ?? []);
          const currentConfig = {
            ...(channelIntegrations[channelId].config || {}),
          };

          for (const [configKey, configValue] of Object.entries(update.config)) {
            if (allowedKeys.size > 0 && !allowedKeys.has(configKey)) continue;
            if (typeof configValue !== "string") continue;
            if (configValue === MASKED_SECRET) continue;

            if (configValue.trim().length === 0) {
              delete currentConfig[configKey];
            } else {
              currentConfig[configKey] = configValue;
            }
          }

          channelIntegrations[channelId] = {
            ...channelIntegrations[channelId],
            ...(Object.keys(currentConfig).length > 0
              ? { config: currentConfig }
              : {}),
          };
        }
      }
    }

    // AI providers
    if (aiProvidersPayload && typeof aiProvidersPayload === "object") {
      for (const key of ALL_AI_PROVIDERS) {
        const update = aiProvidersPayload[key];
        if (!update) continue;

        if (!aiProviders[key]) {
          aiProviders[key] = {};
        }

        // Only update apiKey if it changed (not the mask)
        if (typeof update.apiKey === "string" && update.apiKey !== MASKED_SECRET) {
          aiProviders[key] = {
            ...aiProviders[key],
            apiKey: update.apiKey.trim() || undefined,
          };
        }
        if (typeof update.baseUrl === "string") {
          aiProviders[key] = {
            ...aiProviders[key],
            baseUrl: update.baseUrl.trim() || undefined,
          };
        }

        // Remove provider entry entirely if both fields are empty
        if (!aiProviders[key].apiKey && !aiProviders[key].baseUrl) {
          delete aiProviders[key];
        }
      }
    }

    // Timezone
    if (timezonePayload !== undefined) {
      timezone =
        timezonePayload === "" || timezonePayload === null
          ? null
          : timezonePayload;
    }

    if (primaryCodingCliPayload !== undefined) {
      if (
        primaryCodingCliPayload === null ||
        primaryCodingCliPayload === "" ||
        (typeof primaryCodingCliPayload === "string" &&
          CODING_CLI_SKILL_IDS.includes(primaryCodingCliPayload as (typeof CODING_CLI_SKILL_IDS)[number]))
      ) {
        primaryCodingCli =
          primaryCodingCliPayload === "" || primaryCodingCliPayload === null
            ? null
            : primaryCodingCliPayload;
      }
    }

    if (chatModelPayload !== undefined) {
      chatModel =
        chatModelPayload === "" || chatModelPayload === null
          ? null
          : chatModelPayload;
    }

    const existing = await supabaseRequest<UserSettingsRow[]>("user_settings", {
      params: { select: "id", user_id: `eq.${userId}` },
    });
    const row = Array.isArray(existing) ? existing[0] : null;
    const now = new Date().toISOString();

    if (row) {
      await supabaseRequest("user_settings", {
        method: "PATCH",
        params: { user_id: `eq.${userId}` },
        body: {
          skill_sources: skillSources,
          channel_integrations: channelIntegrations,
          ai_providers: aiProviders,
          primary_coding_cli: primaryCodingCli,
          chat_model: chatModel,
          timezone: timezone,
          updated_at: now,
        },
      });
    } else {
      await supabaseRequest("user_settings", {
        method: "POST",
        prefer: "return=minimal",
        body: {
          user_id: userId,
          skill_sources: skillSources,
          channel_integrations: channelIntegrations,
          ai_providers: aiProviders,
          primary_coding_cli: primaryCodingCli,
          chat_model: chatModel,
          timezone: timezone,
          updated_at: now,
        },
      });
    }

    return json({ ok: true, message: "Settings saved" });
  } catch (err: any) {
    console.error("[Settings API] Failed to save:", err);
    return json({ error: err?.message || "Failed to save settings" }, { status: 500 });
  }
};
