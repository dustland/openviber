/**
 * User settings - Supabase as single source of truth.
 * ~/.openviber/settings.yaml on nodes is a local cache (written when tasks run with settings from hub).
 */

import { supabaseRequest } from "./supabase-rest";

export interface SkillSourceSetting {
  enabled: boolean;
  url?: string;
  apiKey?: string;
}

/** User-configured channel integration settings. */
export interface ChannelIntegrationSetting {
  enabled: boolean;
  config?: Record<string, string>;
}

/** Per-provider AI configuration (API key + optional base URL). */
export interface AiProviderSetting {
  apiKey?: string;
  baseUrl?: string;
}

export interface UserSettingsRow {
  id: string;
  user_id: string;
  skill_sources: Record<string, SkillSourceSetting>;
  channel_integrations?: Record<string, ChannelIntegrationSetting> | null;
  primary_coding_cli: string | null;
  chat_model: string | null;
  ai_providers: Record<string, AiProviderSetting>;
  timezone: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  skillSources: Record<string, SkillSourceSetting>;
  channelIntegrations: Record<string, ChannelIntegrationSetting>;
  primaryCodingCli: string | null;
  chatModel: string | null;
  aiProviders: Record<string, AiProviderSetting>;
  timezone: string | null;
  onboardingCompletedAt: string | null;
}

const DEFAULT_SKILL_SOURCES: Record<string, SkillSourceSetting> = {
  openclaw: { enabled: true },
  github: { enabled: true },
  npm: { enabled: true },
  huggingface: { enabled: true },
  smithery: { enabled: true },
  composio: { enabled: false },
  glama: { enabled: true },
};

const DEFAULT_CHANNEL_INTEGRATIONS: Record<string, ChannelIntegrationSetting> = {
  discord: { enabled: false, config: {} },
  feishu: { enabled: false, config: {} },
};

function normalizeChannelIntegrations(
  raw?: Record<string, ChannelIntegrationSetting> | null,
): Record<string, ChannelIntegrationSetting> {
  const normalized: Record<string, ChannelIntegrationSetting> = {
    ...DEFAULT_CHANNEL_INTEGRATIONS,
  };

  if (!raw || typeof raw !== "object") {
    return normalized;
  }

  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const enabled = typeof value.enabled === "boolean" ? value.enabled : false;
    const config: Record<string, string> = {};

    if (value.config && typeof value.config === "object") {
      for (const [configKey, configValue] of Object.entries(value.config)) {
        if (typeof configValue === "string" && configValue.length > 0) {
          config[configKey] = configValue;
        }
      }
    }

    normalized[key] = {
      enabled,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };
  }

  return normalized;
}

export interface Personalization {
  soulMd: string;
  userMd: string;
  memoryMd: string;
}

/**
 * Fetch personalization markdown files for a user.
 */
export async function getPersonalizationForUser(userId: string): Promise<Personalization> {
  try {
    const rows = await supabaseRequest<{ soul_md: string; user_md: string; memory_md: string }[]>(
      "user_settings",
      {
        params: {
          select: "soul_md,user_md,memory_md",
          user_id: `eq.${userId}`,
        },
      },
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    return {
      soulMd: row?.soul_md ?? "",
      userMd: row?.user_md ?? "",
      memoryMd: row?.memory_md ?? "",
    };
  } catch {
    return { soulMd: "", userMd: "", memoryMd: "" };
  }
}

/**
 * Fetch settings for a user from Supabase. Returns defaults if no row exists.
 */
export async function getSettingsForUser(userId: string): Promise<UserSettings> {
  try {
    const rows = await supabaseRequest<UserSettingsRow[]>("user_settings", {
      params: {
        select: "skill_sources,primary_coding_cli,chat_model,channel_integrations,ai_providers,timezone,onboarding_completed_at",
        user_id: `eq.${userId}`,
      },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return {
        skillSources: DEFAULT_SKILL_SOURCES,
        channelIntegrations: DEFAULT_CHANNEL_INTEGRATIONS,
        primaryCodingCli: null,
        chatModel: null,
        aiProviders: {},
        timezone: null,
        onboardingCompletedAt: null,
      };
    }
    return {
      skillSources:
        row.skill_sources && typeof row.skill_sources === "object"
          ? { ...DEFAULT_SKILL_SOURCES, ...row.skill_sources }
          : DEFAULT_SKILL_SOURCES,
      channelIntegrations: normalizeChannelIntegrations(row.channel_integrations),
      primaryCodingCli:
        row.primary_coding_cli != null && row.primary_coding_cli !== ""
          ? row.primary_coding_cli
          : null,
      chatModel:
        row.chat_model != null && row.chat_model !== ""
          ? row.chat_model
          : null,
      aiProviders:
        row.ai_providers && typeof row.ai_providers === "object"
          ? row.ai_providers
          : {},
      timezone:
        row.timezone != null && row.timezone !== ""
          ? row.timezone
          : null,
      onboardingCompletedAt: row.onboarding_completed_at ?? null,
    };
  } catch (err) {
    console.error("[user-settings] Failed to fetch from Supabase:", err);
    return {
      skillSources: DEFAULT_SKILL_SOURCES,
      channelIntegrations: DEFAULT_CHANNEL_INTEGRATIONS,
      primaryCodingCli: null,
      chatModel: null,
      aiProviders: {},
      timezone: null,
      onboardingCompletedAt: null,
    };
  }
}
