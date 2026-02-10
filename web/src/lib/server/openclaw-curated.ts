import type { ExternalSkillInfo } from "../../../../src/skills/hub";

const CURATED_README_URL =
  "https://raw.githubusercontent.com/VoltAgent/awesome-openclaw-skills/main/README.md";
const CACHE_TTL_MS = 10 * 60 * 1000;

type CuratedSkill = ExternalSkillInfo & { category?: string; rank: number };

let cache: {
  loadedAt: number;
  skills: CuratedSkill[];
} | null = null;

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function parseSkillLine(line: string): { id: string; description: string } | null {
  const raw = line.trim();
  if (!raw.startsWith("* ") && !raw.startsWith("- ")) return null;
  const body = raw.slice(2).trim();

  const separators = [" \\- ", " - ", " — ", " – "];
  for (const sep of separators) {
    const idx = body.indexOf(sep);
    if (idx <= 0) continue;
    const id = body.slice(0, idx).trim();
    const description = body.slice(idx + sep.length).trim();
    if (!id) return null;
    return {
      id,
      description,
    };
  }

  return null;
}

function mapReadmeToSkills(readme: string): CuratedSkill[] {
  const lines = readme.split(/\r?\n/);
  const skills: CuratedSkill[] = [];
  let currentCategory = "";
  let rank = 0;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      currentCategory = line.slice(4).trim();
      continue;
    }

    const parsed = parseSkillLine(line);
    if (!parsed) continue;

    rank += 1;
    const categoryTag = currentCategory
      ? currentCategory
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      : "";

    skills.push({
      id: parsed.id,
      name: parsed.id,
      description: parsed.description,
      author: "community",
      version: "curated",
      source: "openclaw",
      url: `https://github.com/openclaw/skills/tree/main/${encodeURIComponent(parsed.id)}`,
      tags: categoryTag ? [categoryTag] : [],
      category: currentCategory || undefined,
      rank,
    });
  }

  return skills;
}

export async function loadCuratedOpenClawSkills(): Promise<CuratedSkill[]> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.skills;
  }

  const response = await fetch(CURATED_README_URL, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`Failed to load curated skills index (HTTP ${response.status})`);
  }

  const readme = await response.text();
  const skills = mapReadmeToSkills(readme);

  cache = {
    loadedAt: now,
    skills,
  };

  return skills;
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
