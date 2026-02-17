/**
 * OpenClaw curated skills catalog.
 *
 * Skills are loaded from the pre-built static JSON catalog at
 * web/static/skills-catalog.json. The catalog is updated via:
 *   pnpm update:skills
 *
 * This replaces the previous runtime GitHub fetch, making skill
 * lookups instant and offline-friendly.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { ExternalSkillInfo } from "../../../../src/skills/hub";

type CuratedSkill = ExternalSkillInfo & {
  importId?: string;
  category?: string;
  rank: number;
};

interface SkillsCatalog {
  generatedAt: string;
  source: string;
  count: number;
  skills: CuratedSkill[];
}

let cachedSkills: CuratedSkill[] | null = null;

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
 * Load the curated skills catalog from the static JSON file.
 * The catalog is read once and cached in memory for the lifetime
 * of the server process.
 */
export async function loadCuratedOpenClawSkills(): Promise<CuratedSkill[]> {
  if (cachedSkills) {
    return cachedSkills;
  }

  try {
    // In SvelteKit, static files are served from web/static/
    // At runtime, we read the file directly from the filesystem
    const catalogPath = join(process.cwd(), "static", "skills-catalog.json");
    const raw = readFileSync(catalogPath, "utf-8");
    const catalog: SkillsCatalog = JSON.parse(raw);
    cachedSkills = catalog.skills;
    console.log(
      `[Skills] Loaded ${cachedSkills.length} curated skills from static catalog (generated ${catalog.generatedAt})`,
    );
    return cachedSkills;
  } catch (error) {
    console.warn("[Skills] Failed to load static catalog, returning empty:", error);
    cachedSkills = [];
    return cachedSkills;
  }
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
