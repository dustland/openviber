/**
 * Skill Hub Settings Persistence
 *
 * Reads/writes skill source configuration from ~/.openviber/settings.yaml.
 * The settings file stores which sources are enabled, custom URLs, and API keys.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import { getViberRoot } from "../../config";
import { getDefaultSourcesConfig, type SkillSourcesConfig } from "./manager";
import type { SkillHubProviderType } from "./types";

/** Canonical list of coding CLI skill IDs (for validation and UI). */
export const CODING_CLI_SKILL_IDS = [
  "codex-cli",
  "cursor-agent",
  "gemini-cli",
] as const;

export type PrimaryCodingCliId = (typeof CODING_CLI_SKILL_IDS)[number];

/** Stored configuration for a chat channel integration. */
export interface ChannelIntegrationSetting {
  enabled: boolean;
  config?: Record<string, string>;
}

/** Full settings file shape */
export interface OpenViberSettings {
  /** Skill hub source configuration */
  skillSources?: SkillSourcesConfig;
  /** Primary coding CLI skill to prefer for coding tasks (null = let agent choose). */
  primaryCodingCli?: string | null;
  /** Configured channel integrations (Discord, Feishu, etc.). */
  channelIntegrations?: Record<string, ChannelIntegrationSetting>;
}

const SETTINGS_FILENAME = "settings.yaml";

function getSettingsPath(): string {
  return path.join(getViberRoot(), SETTINGS_FILENAME);
}

/**
 * Load settings from ~/.openviber/settings.yaml.
 * Returns defaults if file doesn't exist or is invalid.
 */
export async function loadSettings(): Promise<OpenViberSettings> {
  try {
    const raw = await fs.readFile(getSettingsPath(), "utf8");
    const parsed = YAML.parse(raw);
    if (parsed && typeof parsed === "object") {
      return normalizeSettings(parsed);
    }
    return { skillSources: getDefaultSourcesConfig(), channelIntegrations: {} };
  } catch {
    return { skillSources: getDefaultSourcesConfig(), channelIntegrations: {} };
  }
}

/**
 * Save settings to ~/.openviber/settings.yaml.
 */
export async function saveSettings(settings: OpenViberSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });

  const header = `# OpenViber Settings\n# Manage these from the OpenViber web UI at /settings\n\n`;
  const content = header + YAML.stringify(settings, { indent: 2 });
  await fs.writeFile(settingsPath, content, "utf8");
}

/**
 * Load only the skill sources configuration.
 */
export async function loadSkillSourcesConfig(): Promise<SkillSourcesConfig> {
  const settings = await loadSettings();
  return settings.skillSources || getDefaultSourcesConfig();
}

/**
 * Save only the skill sources configuration.
 */
export async function saveSkillSourcesConfig(
  config: SkillSourcesConfig,
): Promise<void> {
  const settings = await loadSettings();
  settings.skillSources = config;
  await saveSettings(settings);
}

/** Normalize/validate settings read from disk */
function normalizeSettings(raw: any): OpenViberSettings {
  const settings: OpenViberSettings = {};

  if (raw.skillSources && typeof raw.skillSources === "object") {
    const defaults = getDefaultSourcesConfig();
    const normalized: SkillSourcesConfig = {};

    // Merge with defaults to ensure all providers are present
    const allTypes: SkillHubProviderType[] = [
      "openclaw",
      "npm",
      "huggingface",
      "smithery",
      "composio",
      "glama",
    ];

    for (const type of allTypes) {
      const saved = raw.skillSources[type];
      const def = defaults[type] || { enabled: false };

      if (saved && typeof saved === "object") {
        normalized[type] = {
          enabled: typeof saved.enabled === "boolean" ? saved.enabled : def.enabled,
          url: typeof saved.url === "string" && saved.url ? saved.url : undefined,
          apiKey:
            typeof saved.apiKey === "string" && saved.apiKey
              ? saved.apiKey
              : undefined,
        };
      } else {
        normalized[type] = { ...def };
      }
    }

    settings.skillSources = normalized;
  } else {
    settings.skillSources = getDefaultSourcesConfig();
  }

  // Normalize primaryCodingCli: only allow known coding CLI ids
  if (
    raw.primaryCodingCli != null &&
    typeof raw.primaryCodingCli === "string" &&
    (CODING_CLI_SKILL_IDS as readonly string[]).includes(raw.primaryCodingCli)
  ) {
    settings.primaryCodingCli = raw.primaryCodingCli;
  } else {
    settings.primaryCodingCli = undefined;
  }

  if (raw.channelIntegrations && typeof raw.channelIntegrations === "object") {
    const normalized: Record<string, ChannelIntegrationSetting> = {};
    for (const [key, value] of Object.entries(raw.channelIntegrations)) {
      if (!value || typeof value !== "object") continue;
      const channelValue = value as {
        enabled?: unknown;
        config?: Record<string, unknown>;
      };
      const enabled =
        typeof channelValue.enabled === "boolean" ? channelValue.enabled : false;
      const config: Record<string, string> = {};
      if (channelValue.config && typeof channelValue.config === "object") {
        for (const [configKey, configValue] of Object.entries(channelValue.config)) {
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
    settings.channelIntegrations = normalized;
  } else {
    settings.channelIntegrations = {};
  }

  return settings;
}
