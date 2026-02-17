#!/usr/bin/env npx tsx
/**
 * Fetches the awesome-openclaw-skills README from GitHub, parses it into
 * a structured JSON catalog, and writes it to web/static/skills-catalog.json.
 *
 * Run: npx tsx scripts/update-skills-catalog.ts
 * Or:  pnpm update:skills
 */

const CURATED_README_URL =
  "https://raw.githubusercontent.com/VoltAgent/awesome-openclaw-skills/main/README.md";

const NON_CATEGORY_HEADINGS = new Set([
  "awesome openclaw skills",
  "installation",
  "why this list exists?",
  "table of contents",
]);

interface CatalogSkill {
  id: string;
  importId: string;
  name: string;
  description: string;
  author: string;
  version: string;
  source: string;
  url: string;
  tags: string[];
  category?: string;
  rank: number;
}

function slugifyCategory(value: string): string {
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
    return { id, importId: id, description };
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

function mapReadmeToSkills(readme: string): CatalogSkill[] {
  const lines = readme.split(/\r?\n/);
  const skills: CatalogSkill[] = [];
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
        `https://github.com/openclaw/skills/tree/main/${parsed.importId || parsed.id}`,
      tags: categoryTag ? [categoryTag] : [],
      category: currentCategory || undefined,
      rank,
    });
  }

  return skills;
}

async function main() {
  console.log(`Fetching curated skills from ${CURATED_README_URL}...`);

  const response = await fetch(CURATED_README_URL, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    console.error(`Failed to fetch: HTTP ${response.status}`);
    process.exit(1);
  }

  const readme = await response.text();
  const skills = mapReadmeToSkills(readme);

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: CURATED_README_URL,
    count: skills.length,
    skills,
  };

  const outPath = new URL("../web/static/skills-catalog.json", import.meta.url);
  const { writeFileSync, mkdirSync } = await import("fs");
  const { dirname } = await import("path");
  const { fileURLToPath } = await import("url");

  const filePath = fileURLToPath(outPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(catalog, null, 2) + "\n");

  console.log(`✅ Wrote ${skills.length} skills to ${filePath}`);
}

main().catch((err) => {
  console.error("Failed to update skills catalog:", err);
  process.exit(1);
});
