import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getSettingsForUser,
  type UserSettings,
  type SkillSourceSetting as ServerSkillSourceSetting,
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
      apiKey: saved?.apiKey ? "••••••" : undefined, // Mask API key
      ...meta,
    };
  }

  return json({
    sources,
    primaryCodingCli: settings.primaryCodingCli ?? null,
    codingCliOptions: CODING_CLI_OPTIONS,
  });
};

interface UserSettingsRow {
  id: string;
  user_id: string;
  skill_sources: Record<string, SkillSourceSetting>;
  primary_coding_cli: string | null;
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
      primaryCodingCli?: string | null;
    };
    const { sources, primaryCodingCli: primaryCodingCliPayload } = payload;

    const userId = locals.user.id;

    // Load current from Supabase
    const current = await getSettingsForUser(userId);
    let skillSources = { ...current.skillSources };
    let primaryCodingCli: string | null = current.primaryCodingCli;

    if (sources && typeof sources === "object") {
      const defaults = getDefaultSources();
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
        if (typeof update.apiKey === "string" && update.apiKey !== "••••••") {
          skillSources[key] = { ...skillSources[key], apiKey: update.apiKey || undefined };
        }
      }
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
          primary_coding_cli: primaryCodingCli,
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
          primary_coding_cli: primaryCodingCli,
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
