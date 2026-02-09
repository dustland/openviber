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

/** Full settings file shape */
export interface OpenViberSettings {
  /** Skill hub source configuration */
  skillSources?: SkillSourcesConfig;
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
    return { skillSources: getDefaultSourcesConfig() };
  } catch {
    return { skillSources: getDefaultSourcesConfig() };
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
      "github",
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

  return settings;
}
