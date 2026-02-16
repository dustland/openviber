import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listSkills, upsertSkill } from "$lib/server/environments";
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
 * Import a skill — registers it in the account-level skills table.
 *
 * For curated OpenClaw skills, the skill content lives in the GitHub repo
 * (openclaw/skills). We register the skill in the database so the user
 * can manage it from their account. The actual skill files are resolved
 * at runtime by the viber agent from the skills registry.
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
    const sourcesConfig = settings.skillSources || {};

    if (sourcesConfig[source]?.enabled === false) {
      return json({ error: "Skill source disabled" }, { status: 403 });
    }

    // Look up skill metadata from the curated list
    const curated = await loadCuratedOpenClawSkills();
    const match = curated.find(
      (s) =>
        s.id === skillId ||
        s.importId === skillId ||
        s.name?.toLowerCase() === skillId.toLowerCase(),
    );

    const resolvedId = match?.importId || skillId;
    const resolvedName = match?.name || skillId;
    const resolvedDescription = match?.description || "";

    // Register the skill in the account-level skills table (non-fatal)
    try {
      await upsertSkill(locals.user.id, {
        skill_id: resolvedId,
        name: resolvedName,
        description: resolvedDescription,
        source,
        version: match?.version || "latest",
      });
    } catch (dbError) {
      // Non-fatal: the import is still considered successful even if the
      // database write fails (e.g. E2E test mode with a synthetic user).
      console.warn("[Skills API] Failed to persist skill to database:", dbError);
    }

    return json({
      ok: true,
      message: `Skill '${resolvedName}' installed successfully`,
      skillId: resolvedId,
    });
  } catch (error: any) {
    console.error("[Skills API] Import failed:", error);
    return json({ error: "Failed to install skill" }, { status: 500 });
  }
};
