import type { ExternalSkillInfo } from "../../../../src/skills/hub";

const CURATED_README_URL =
  "https://raw.githubusercontent.com/VoltAgent/awesome-openclaw-skills/main/README.md";
const CACHE_TTL_MS = 10 * 60 * 1000;
const NON_CATEGORY_HEADINGS = new Set([
  "awesome openclaw skills",
  "installation",
  "why this list exists?",
  "table of contents",
]);

type CuratedSkill = ExternalSkillInfo & {
  importId?: string;
  category?: string;
  rank: number;
};

let cache: {
  loadedAt: number;
  skills: CuratedSkill[];
} | null = null;

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

export function slugifyCategory(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractImportIdFromUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const match = url.pathname.match(
      /\/skills\/([^/]+)\/([^/]+)\/SKILL\.md$/i,
    );
    if (!match) return undefined;
    const owner = decodeURIComponent(match[1]);
    const skill = decodeURIComponent(match[2]);
    if (!owner || !skill) return undefined;
    return `${owner}/${skill}`;
  } catch {
    return undefined;
  }
}

function parseSkillLine(
  line: string,
): { id: string; importId: string; description: string; url?: string } | null {
  const raw = line.trim();
  if (!raw.startsWith("* ") && !raw.startsWith("- ")) return null;
  const body = raw.slice(2).trim();

  const markdownLinkMatch = body.match(/^\[([^\]]+)\]\(([^)]+)\)\s*-\s*(.+)$/);
  if (markdownLinkMatch) {
    const id = markdownLinkMatch[1].trim();
    const url = markdownLinkMatch[2].trim();
    const description = markdownLinkMatch[3].trim();
    if (!id) return null;
    return {
      id,
      importId: extractImportIdFromUrl(url) || id,
      description,
      url,
    };
  }

  const separators = [" - ", " — ", " – "];
  for (const sep of separators) {
    const idx = body.indexOf(sep);
    if (idx <= 0) continue;
    const id = body.slice(0, idx).trim();
    const description = body.slice(idx + sep.length).trim();
    if (!id) return null;
    return {
      id,
      importId: id,
      description,
    };
  }

  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseCategoryHeading(line: string): string | null {
  const headingMatch = line.match(/^##+\s+(.+)$/);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  const summaryMatch = line.match(
    /<summary>\s*<h3[^>]*>\s*(.*?)\s*<\/h3>\s*<\/summary>/i,
  );
  if (summaryMatch) {
    return decodeHtmlEntities(summaryMatch[1].trim());
  }

  return null;
}

function mapReadmeToSkills(readme: string): CuratedSkill[] {
  const lines = readme.split(/\r?\n/);
  const skills: CuratedSkill[] = [];
  let currentCategory = "";
  let rank = 0;

  for (const line of lines) {
    const heading = parseCategoryHeading(line);
    if (heading) {
      const normalized = heading.toLowerCase();
      currentCategory = NON_CATEGORY_HEADINGS.has(normalized) ? "" : heading;
      continue;
    }

    if (line.includes("</details>")) {
      currentCategory = "";
      continue;
    }

    const parsed = parseSkillLine(line);
    if (!parsed) continue;
    if (!currentCategory) continue;

    rank += 1;
    const categoryTag = currentCategory ? slugifyCategory(currentCategory) : "";

    skills.push({
      id: parsed.id,
      importId: parsed.importId,
      name: parsed.id,
      description: parsed.description,
      author: "community",
      version: "curated",
      source: "openclaw",
      url:
        parsed.url ||
        `https://github.com/openclaw/skills/tree/main/${encodeURIComponent(parsed.id)}`,
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
