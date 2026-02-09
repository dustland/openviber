import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import YAML from "yaml";

const SETTINGS_PATH = path.join(os.homedir(), ".openviber", "settings.yaml");

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

interface SkillSourceSetting {
  enabled: boolean;
  url?: string;
  apiKey?: string;
}

interface SettingsFile {
  skillSources?: Record<string, SkillSourceSetting>;
}

async function readSettings(): Promise<SettingsFile> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = YAML.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSettings(settings: SettingsFile): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  const header = `# OpenViber Settings\n# Manage these from the OpenViber web UI at /settings\n\n`;
  await fs.writeFile(SETTINGS_PATH, header + YAML.stringify(settings, { indent: 2 }), "utf8");
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
 * Returns the current settings + provider metadata for the UI.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await readSettings();
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
    const saved = settings.skillSources?.[key];
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
      apiKey: saved?.apiKey ? "••••••" : undefined, // Mask API key
      ...meta,
    };
  }

  return json({ sources });
};

/**
 * PUT /api/settings
 * Update skill source settings.
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { sources } = body as {
      sources?: Record<string, Partial<SkillSourceSetting>>;
    };

    if (!sources || typeof sources !== "object") {
      return json({ error: "Invalid payload: expected { sources: {...} }" }, { status: 400 });
    }

    // Load current settings
    const settings = await readSettings();
    const current = settings.skillSources || getDefaultSources();

    // Merge updates
    for (const key of ALL_PROVIDERS) {
      const update = sources[key];
      if (!update) continue;

      if (!current[key]) {
        current[key] = { enabled: false };
      }

      if (typeof update.enabled === "boolean") {
        current[key].enabled = update.enabled;
      }
      if (typeof update.url === "string") {
        current[key].url = update.url || undefined;
      }
      // Only update apiKey if it's not the masked value
      if (typeof update.apiKey === "string" && update.apiKey !== "••••••") {
        current[key].apiKey = update.apiKey || undefined;
      }
    }

    settings.skillSources = current;
    await writeSettings(settings);

    return json({ ok: true, message: "Settings saved" });
  } catch (err: any) {
    console.error("[Settings API] Failed to save:", err);
    return json({ error: err?.message || "Failed to save settings" }, { status: 500 });
  }
};
