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

export interface UserSettingsRow {
  id: string;
  user_id: string;
  skill_sources: Record<string, SkillSourceSetting>;
  primary_coding_cli: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  skillSources: Record<string, SkillSourceSetting>;
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

/**
 * Fetch settings for a user from Supabase. Returns defaults if no row exists.
 */
export async function getSettingsForUser(userId: string): Promise<UserSettings> {
  try {
    const rows = await supabaseRequest<UserSettingsRow[]>("user_settings", {
      params: {
        select: "skill_sources,primary_coding_cli",
        user_id: `eq.${userId}`,
      },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return {
        skillSources: DEFAULT_SKILL_SOURCES,
        primaryCodingCli: null,
      };
    }
    return {
      skillSources:
        row.skill_sources && typeof row.skill_sources === "object"
          ? { ...DEFAULT_SKILL_SOURCES, ...row.skill_sources }
          : DEFAULT_SKILL_SOURCES,
      primaryCodingCli:
        row.primary_coding_cli != null && row.primary_coding_cli !== ""
          ? row.primary_coding_cli
          : null,
    };
  } catch (err) {
    console.error("[user-settings] Failed to fetch from Supabase:", err);
    return {
      skillSources: DEFAULT_SKILL_SOURCES,
      primaryCodingCli: null,
    };
  }
}
