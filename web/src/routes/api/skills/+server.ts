import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listSkills, upsertSkill } from "$lib/server/environments";
import {
  SkillHubManager,
  type SkillHubProviderType,
  type SkillSourcesConfig,
} from "../../../../../src/skills/hub";
import { getSettingsForUser } from "$lib/server/settings";
import { loadCuratedOpenClawSkills } from "$lib/server/openclaw-curated";

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  source: string | null;
  version: string | null;
}

const PROVIDERS = ["openclaw"] as const;
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
 * GET /api/skills
 * Returns all account-level skills for the authenticated user (including global skills).
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listSkills(locals.user.id);

    const skills: SkillInfo[] = rows.map((row) => ({
      id: row.skill_id,
      name: row.name,
      description: row.description || "",
      source: row.source,
      version: row.version,
    }));

    return json({ skills, count: skills.length });
  } catch (error) {
    console.error("[Skills API] Failed to list skills:", error);
    return json({ error: "Failed to list skills" }, { status: 500 });
  }
};

/**
 * POST /api/skills
 * Import a skill from an external hub source.
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
      return json({ error: "Missing or invalid skill source" }, { status: 400 });
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

    let result = null as Awaited<ReturnType<typeof manager.importSkill>> | null;
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
      return json({ error: result.message, details: result.error }, { status: 502 });
    }

    // Register the imported skill in the account-level skills table
    try {
      const curated = await loadCuratedOpenClawSkills();
      const match = curated.find(
        (s) =>
          s.id === skillId ||
          s.importId === skillId ||
          s.name?.toLowerCase() === skillId.toLowerCase(),
      );
      await upsertSkill(locals.user.id, {
        skill_id: result.skillId || skillId,
        name: match?.name || result.skillId || skillId,
        description: match?.description || "",
        source,
        version: match?.version,
      });
    } catch (syncError) {
      console.warn("[Skills API] Failed to sync skill to account:", syncError);
    }

    return json({
      ok: true,
      message: result.message,
      installPath: result.installPath,
    });
  } catch (error: any) {
    console.error("[Skills API] Import failed:", error);
    return json({ error: "Failed to import skill" }, { status: 500 });
  }
};
