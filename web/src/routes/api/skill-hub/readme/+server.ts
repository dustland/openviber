import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSettingsForUser } from "$lib/server/user-settings";

const DEFAULT_HUB_URL = "https://hub.openclaw.org/api/v1";

function resolveHubUrl(customUrl?: string): string {
  return (customUrl || process.env.OPENCLAW_HUB_URL || DEFAULT_HUB_URL).replace(
    /\/$/,
    "",
  );
}

function toRawGitHubUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host === "raw.githubusercontent.com" && path.endsWith("/SKILL.md")) {
      return parsed.toString();
    }

    if (host !== "github.com") return null;

    const treeMatch = path.match(
      /^\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+\/SKILL\.md)$/i,
    );
    if (treeMatch) {
      const owner = treeMatch[1];
      const repo = treeMatch[2];
      const branch = treeMatch[3];
      const filePath = treeMatch[4];
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    }

    const blobMatch = path.match(
      /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\/SKILL\.md)$/i,
    );
    if (blobMatch) {
      const owner = blobMatch[1];
      const repo = blobMatch[2];
      const branch = blobMatch[3];
      const filePath = blobMatch[4];
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    }
  } catch {
    // noop
  }

  return null;
}

function buildIdCandidates(skillId: string): string[] {
  const out = [skillId];
  if (skillId.includes("/")) {
    const slug = skillId.split("/").pop();
    if (slug && slug !== skillId) out.push(slug);
  }
  return Array.from(new Set(out));
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = url.searchParams.get("source")?.trim();
  const skillId = url.searchParams.get("skillId")?.trim();
  const skillUrl = url.searchParams.get("skillUrl")?.trim();

  if (!source || source !== "openclaw") {
    return json({ error: "Missing or invalid source" }, { status: 400 });
  }
  if (!skillId) {
    return json({ error: "Missing skillId" }, { status: 400 });
  }

  try {
    const settings = await getSettingsForUser(locals.user.id);
    const openclawSettings = settings.skillSources?.openclaw;
    if (openclawSettings?.enabled === false) {
      return json({ error: "Skill source disabled" }, { status: 403 });
    }

    const hubUrl = resolveHubUrl(openclawSettings?.url);
    const idCandidates = buildIdCandidates(skillId);

    const candidateRawUrls: string[] = [];
    const fromSkillUrl = skillUrl ? toRawGitHubUrl(skillUrl) : null;
    if (fromSkillUrl) candidateRawUrls.push(fromSkillUrl);

    for (const candidate of idCandidates) {
      const namespaced = candidate.match(/^([^/]+)\/([^/]+)$/);
      if (namespaced) {
        const owner = namespaced[1];
        const skill = namespaced[2];
        candidateRawUrls.push(
          `https://raw.githubusercontent.com/openclaw/skills/main/skills/${owner}/${skill}/SKILL.md`,
        );
      }

      const infoRes = await fetch(`${hubUrl}/skills/${encodeURIComponent(candidate)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);

      if (!infoRes?.ok) continue;
      const info = (await infoRes.json()) as Record<string, unknown>;
      const inlineReadme =
        (typeof info.readme === "string" && info.readme) ||
        (typeof info.skillMd === "string" && info.skillMd) ||
        (typeof info.skill_md === "string" && info.skill_md);

      if (inlineReadme) {
        return json({
          markdown: inlineReadme,
          sourceRepoUrl: typeof info.url === "string" ? info.url : skillUrl || "",
        });
      }

      const readmeUrl =
        (typeof info.readmeUrl === "string" && info.readmeUrl) ||
        (typeof info.readme_url === "string" && info.readme_url) ||
        (typeof info.url === "string" && info.url);
      const rawFromInfo = readmeUrl ? toRawGitHubUrl(readmeUrl) : null;
      if (rawFromInfo) {
        candidateRawUrls.push(rawFromInfo);
      }
    }

    for (const rawUrl of Array.from(new Set(candidateRawUrls))) {
      const readmeRes = await fetch(rawUrl, {
        headers: { Accept: "text/plain" },
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      if (!readmeRes?.ok) continue;
      const markdown = await readmeRes.text();
      if (markdown.trim()) {
        return json({
          markdown,
          sourceRepoUrl: skillUrl || rawUrl,
        });
      }
    }

    return json({ error: "SKILL.md not found for this skill" }, { status: 404 });
  } catch (error) {
    console.error("[Skill Hub API] Readme fetch failed:", error);
    return json({ error: "Failed to load SKILL.md" }, { status: 500 });
  }
};
