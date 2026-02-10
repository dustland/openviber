import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listSkills } from "$lib/server/environments";

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  source: string | null;
  version: string | null;
}

/**
 * GET /api/skills
 * Returns all account-level skills for the authenticated user.
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
