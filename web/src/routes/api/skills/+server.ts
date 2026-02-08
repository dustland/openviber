import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  usedByNodes: { id: string; name: string }[];
}

/**
 * GET /api/skills
 * Returns all available skills aggregated from connected nodes.
 * Each skill lists which nodes have it installed.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { nodes } = await hubClient.getNodes();
    const skillMap = new Map<string, SkillInfo>();

    for (const node of nodes) {
      const nodeRef = { id: node.id, name: node.name };
      const skills = node.skills ?? [];

      for (const s of skills) {
        const id = s.id || s.name || "unknown";
        if (!skillMap.has(id)) {
          skillMap.set(id, {
            id,
            name: s.name || id,
            description: s.description || "",
            usedByNodes: [],
          });
        }
        const entry = skillMap.get(id)!;
        if (!entry.usedByNodes.some((n) => n.id === node.id)) {
          entry.usedByNodes.push(nodeRef);
        }
      }
    }

    const skills = Array.from(skillMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return json({ skills, count: skills.length });
  } catch (error) {
    console.error("[Skills API] Failed to list skills:", error);
    return json({ error: "Failed to list skills" }, { status: 500 });
  }
};
