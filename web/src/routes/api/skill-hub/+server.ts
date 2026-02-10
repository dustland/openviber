import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  SkillHubManager,
  type SkillHubProviderType,
  type SkillSourcesConfig,
} from "../../../../../src/skills/hub";
import { getSettingsForUser } from "$lib/server/user-settings";
import {
  extractCuratedCategories,
  loadCuratedOpenClawSkills,
  scoreForRelevance,
  slugifyCategory,
} from "$lib/server/openclaw-curated";

const PROVIDERS = [
  "openclaw",
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

function splitCsv(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function sortCuratedSkills(
  skills: Awaited<ReturnType<typeof loadCuratedOpenClawSkills>>,
  sort: string,
  query?: string,
): Awaited<ReturnType<typeof loadCuratedOpenClawSkills>> {
  const sorted = [...skills];

  switch (sort) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      return sorted;
    case "recent":
    case "popularity":
      // Curated list has no stable recency/popularity metadata; preserve curated rank.
      sorted.sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
      return sorted;
    case "relevance":
    default: {
      if (!query) {
        sorted.sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
        return sorted;
      }
      sorted.sort((a, b) => {
        const scoreDiff = scoreForRelevance(b, query) - scoreForRelevance(a, query);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
      });
      return sorted;
    }
  }
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
    const sourcesParam = url.searchParams.get("sources")?.trim();
    const sortParam = url.searchParams.get("sort")?.trim().toLowerCase() || "relevance";
    const pageParam = Number(url.searchParams.get("page") || "1");
    const limitParam = Number(url.searchParams.get("limit") || "20");
    const tagsParam = url.searchParams.get("tags")?.trim();
    const authorParam = url.searchParams.get("author")?.trim().toLowerCase();
    const categoryParam = url.searchParams.get("category")?.trim().toLowerCase();

    const rawRequestedSources = [
      ...(sourcesParam ? sourcesParam.split(",") : []),
      ...(sourceParam ? [sourceParam] : []),
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.toLowerCase() !== "all");

    const invalidSources = rawRequestedSources.filter(
      (value) => !isProviderKey(value),
    );

    if (invalidSources.length > 0) {
      return json(
        {
          error: `Unknown skill source: ${invalidSources.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const requestedSources = Array.from(
      new Set(rawRequestedSources),
    ) as ProviderKey[];

    const settings = await getSettingsForUser(locals.user.id);
    const sourcesConfig = buildSourcesConfig(settings.skillSources || {});

    const enabledSources = PROVIDERS.filter(
      (provider) => sourcesConfig[provider]?.enabled !== false,
    );
    const selectedSources =
      requestedSources.length > 0 ? requestedSources : enabledSources;

    const disabledRequestedSources = selectedSources.filter(
      (provider) => sourcesConfig[provider]?.enabled === false,
    );

    if (disabledRequestedSources.length > 0) {
      return json(
        {
          error: `Skill source disabled: ${disabledRequestedSources.join(", ")}`,
        },
        { status: 403 },
      );
    }

    if (selectedSources.length === 0) {
      return json({
        skills: [],
        total: 0,
        page: 1,
        totalPages: 0,
        sources: [],
      });
    }

    const normalizedTags = splitCsv(tagsParam);
    const normalizedQuery = query?.toLowerCase();
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20;

    const curatedSkills = await loadCuratedOpenClawSkills();
    const categories = extractCuratedCategories(curatedSkills);

    const manager = new SkillHubManager(sourcesConfig);
    const installedSkills = await manager.listInstalled();
    const installedNames = new Set(installedSkills.map((s) => s.name.toLowerCase()));
    const filtered = curatedSkills.filter((skill) => {
      const haystack = `${skill.id} ${skill.name} ${skill.description} ${skill.category || ""}`.toLowerCase();
      if (normalizedQuery && !haystack.includes(normalizedQuery)) {
        return false;
      }
      if (authorParam && (skill.author || "").toLowerCase() !== authorParam) {
        return false;
      }
      if (normalizedTags.length > 0) {
        const tags = (skill.tags || []).map((tag) => tag.toLowerCase());
        const category = (skill.category || "").toLowerCase();
        const matched = normalizedTags.every(
          (tag) => tags.includes(tag) || category.includes(tag),
        );
        if (!matched) return false;
      }
      if (categoryParam) {
        const categoryTag = slugifyCategory(skill.category || "");
        if (categoryTag !== categoryParam) return false;
      }
      return true;
    });

    const sorted = sortCuratedSkills(filtered, sortParam, query);
    const startIndex = (page - 1) * limit;
    const paged = sorted.slice(startIndex, startIndex + limit);
    const total = sorted.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return json({
      skills: paged,
      total,
      page,
      totalPages,
      sources: selectedSources,
      categories,
      installed: Array.from(installedNames),
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
    const attempts = [skillId];
    if (skillId.includes("/")) {
      const slug = skillId.split("/").pop();
      if (slug && slug !== skillId) attempts.push(slug);
    }

    let result = null as Awaited<
      ReturnType<typeof manager.importSkill>
    > | null;
    for (const attemptId of attempts) {
      result = await manager.importSkill(attemptId, {
        source: source as SkillHubProviderType,
      });
      if (result.ok) break;
    }

    if (!result) {
      return json({ error: "Failed to import skill" }, { status: 500 });
    }

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
