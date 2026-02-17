/**
 * OpenClaw curated skills catalog.
 *
 * Skills are loaded from the pre-built JSON catalog at
 * $lib/data/skills-catalog.json. The catalog is updated via:
 *   pnpm update:skills
 *
 * This replaces the previous runtime GitHub fetch, making skill
 * lookups instant and offline-friendly.
 */

import type { ExternalSkillInfo } from "../../../../src/skills/hub";
import catalog from "$lib/data/skills-catalog.json";

type CuratedSkill = ExternalSkillInfo & {
  importId?: string;
  category?: string;
  rank: number;
};

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

export function slugifyCategory(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Load the curated skills catalog.
 * The JSON is imported at build time via Vite — no filesystem access needed.
 */
export async function loadCuratedOpenClawSkills(): Promise<CuratedSkill[]> {
  return catalog.skills as CuratedSkill[];
}

export function scoreForRelevance(skill: CuratedSkill, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;

  const id = normalizeText(skill.id);
  const name = normalizeText(skill.name);
  const description = normalizeText(skill.description || "");
  const category = normalizeText(skill.category || "");

  if (id === q || name === q) return 1000;
  if (id.startsWith(q) || name.startsWith(q)) return 700;
  if (id.includes(q) || name.includes(q)) return 450;
  if (description.includes(q)) return 250;
  if (category.includes(q)) return 120;
  return 0;
}

export function extractCuratedCategories(skills: CuratedSkill[]): Array<{
  name: string;
  tag: string;
  count: number;
}> {
  const counts = new Map<string, { name: string; tag: string; count: number }>();
  for (const skill of skills) {
    const name = skill.category?.trim();
    if (!name) continue;
    const tag = slugifyCategory(name);
    if (!tag) continue;
    const existing = counts.get(tag);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(tag, { name, tag, count: 1 });
  }
  return Array.from(counts.values());
}
