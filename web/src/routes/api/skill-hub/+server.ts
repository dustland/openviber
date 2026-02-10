import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  SkillHubManager,
  type SkillHubProviderType,
  type SkillSearchQuery,
  type SkillSourcesConfig,
} from "../../../../../src/skills/hub";
import { getSettingsForUser } from "$lib/server/user-settings";

const PROVIDERS = [
  "openclaw",
  "github",
  "npm",
  "huggingface",
  "smithery",
  "composio",
  "glama",
] as const;

type ProviderKey = (typeof PROVIDERS)[number];

function isProviderKey(value: string): value is ProviderKey {
  return (PROVIDERS as readonly string[]).includes(value);
}

function buildSourcesConfig(
  settings: Record<string, { enabled?: boolean; url?: string; apiKey?: string }>,
): SkillSourcesConfig {
  const config: SkillSourcesConfig = {};
  for (const key of PROVIDERS) {
    const entry = settings[key];
    if (!entry) continue;
    config[key] = {
      enabled: entry.enabled ?? true,
      url: entry.url || undefined,
      apiKey: entry.apiKey || undefined,
    };
  }
  return config;
}

/**
 * GET /api/skill-hub
 * Search for skills across external sources.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const query = url.searchParams.get("q")?.trim() || undefined;
    const sourceParam = url.searchParams.get("source")?.trim();
    const sortParam = url.searchParams.get("sort")?.trim() || "relevance";
    const pageParam = Number(url.searchParams.get("page") || "1");
    const limitParam = Number(url.searchParams.get("limit") || "20");
    const tagsParam = url.searchParams.get("tags")?.trim();
    const authorParam = url.searchParams.get("author")?.trim();

    const source =
      sourceParam && sourceParam !== "all" ? sourceParam : undefined;

    if (source && !isProviderKey(source)) {
      return json({ error: "Unknown skill source" }, { status: 400 });
    }

    const settings = await getSettingsForUser(locals.user.id);
    const sourcesConfig = buildSourcesConfig(settings.skillSources || {});

    if (source && sourcesConfig[source]?.enabled === false) {
      return json({ error: "Skill source disabled" }, { status: 403 });
    }

    const manager = new SkillHubManager(sourcesConfig);
    const searchQuery: SkillSearchQuery = {
      query,
      tags: tagsParam
        ? tagsParam
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
      author: authorParam || undefined,
      sort: sortParam as SkillSearchQuery["sort"],
      page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1,
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20,
    };

    const result = await manager.search(searchQuery, source as SkillHubProviderType);

    return json({
      skills: result.skills,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (error: any) {
    console.error("[Skill Hub API] Search failed:", error);
    return json({ error: "Failed to search skill hubs" }, { status: 500 });
  }
};

/**
 * POST /api/skill-hub
 * Import a skill from an external source.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      skillId?: string;
      source?: string;
    };
    const skillId = body.skillId?.trim();
    const source = body.source?.trim();

    if (!skillId) {
      return json({ error: "Missing skillId" }, { status: 400 });
    }

    if (!source || !isProviderKey(source)) {
      return json(
        { error: "Missing or invalid skill source" },
        { status: 400 },
      );
    }

    const settings = await getSettingsForUser(locals.user.id);
    const sourcesConfig = buildSourcesConfig(settings.skillSources || {});

    if (sourcesConfig[source]?.enabled === false) {
      return json({ error: "Skill source disabled" }, { status: 403 });
    }

    const manager = new SkillHubManager(sourcesConfig);
    const result = await manager.importSkill(skillId, {
      source: source as SkillHubProviderType,
    });

    if (!result.ok) {
      return json(
        { error: result.message, details: result.error },
        { status: 502 },
      );
    }

    return json({
      ok: true,
      message: result.message,
      installPath: result.installPath,
    });
  } catch (error: any) {
    console.error("[Skill Hub API] Import failed:", error);
    return json({ error: "Failed to import skill" }, { status: 500 });
  }
};
