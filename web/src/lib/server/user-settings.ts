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

export interface UserSettingsRow {
  id: string;
  user_id: string;
  skill_sources: Record<string, SkillSourceSetting>;
  channel_integrations?: Record<string, ChannelIntegrationSetting> | null;
  primary_coding_cli: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  skillSources: Record<string, SkillSourceSetting>;
  channelIntegrations: Record<string, ChannelIntegrationSetting>;
  primaryCodingCli: string | null;
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

/**
 * Fetch settings for a user from Supabase. Returns defaults if no row exists.
 */
export async function getSettingsForUser(userId: string): Promise<UserSettings> {
  try {
    const rows = await supabaseRequest<UserSettingsRow[]>("user_settings", {
      params: {
        select: "skill_sources,primary_coding_cli,channel_integrations",
        user_id: `eq.${userId}`,
      },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return {
        skillSources: DEFAULT_SKILL_SOURCES,
        channelIntegrations: DEFAULT_CHANNEL_INTEGRATIONS,
        primaryCodingCli: null,
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
    };
  } catch (err) {
    console.error("[user-settings] Failed to fetch from Supabase:", err);
    return {
      skillSources: DEFAULT_SKILL_SOURCES,
      channelIntegrations: DEFAULT_CHANNEL_INTEGRATIONS,
      primaryCodingCli: null,
    };
  }
}
