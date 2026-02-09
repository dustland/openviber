/**
 * GitHub Skill Provider
 *
 * Imports OpenViber skills directly from GitHub repositories.
 *
 * Supported import formats:
 *   - "owner/repo"  — full repo is a skill (must contain SKILL.md at root)
 *   - "owner/repo/path/to/skill" — sub-directory skill
 *   - "owner/repo#branch" — specific branch
 *
 * Skills are cloned/downloaded into ~/.openviber/skills/<skill-name>/
 *
 * Search uses the GitHub Search API to find repos with topic "openviber-skill"
 * or that contain a SKILL.md file.
 */

import type {
  SkillHubProvider,
  SkillSearchQuery,
  SkillSearchResult,
  ExternalSkillInfo,
  SkillImportResult,
} from "../types";
import * as fs from "fs/promises";
import * as path from "path";

const GITHUB_API = "https://api.github.com";

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "OpenViber-SkillHub/1.0",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Parse a GitHub skill reference like "owner/repo", "owner/repo#branch", or
 * "owner/repo/subdir"
 */
function parseGitHubRef(ref: string): {
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
} {
  let working = ref.trim();

  // Remove github.com URL prefix if present
  working = working
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");

  // Extract branch from "#branch" suffix
  let branch: string | undefined;
  const hashIdx = working.indexOf("#");
  if (hashIdx !== -1) {
    branch = working.slice(hashIdx + 1);
    working = working.slice(0, hashIdx);
  }

  const parts = working.split("/").filter(Boolean);
  const owner = parts[0] || "";
  const repo = parts[1] || "";
  const subpath = parts.length > 2 ? parts.slice(2).join("/") : undefined;

  return { owner, repo, branch, subpath };
}

export class GitHubProvider implements SkillHubProvider {
  readonly type = "github" as const;
  readonly displayName = "GitHub";

  async search(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const headers = getGitHubHeaders();
    const page = query.page ?? 1;
    const perPage = Math.min(query.limit ?? 20, 100);

    // Build GitHub search query
    const searchTerms: string[] = [];

    if (query.query) {
      searchTerms.push(query.query);
    }

    // Always include the topic filter to find OpenViber skills
    searchTerms.push("topic:openviber-skill");

    // Also search for repos with SKILL.md in the filename
    // Combine: topic-based OR filename-based
    const q = searchTerms.join(" ");

    // Determine sort parameter
    let sort = "best-match";
    let order = "desc";
    if (query.sort === "popularity") {
      sort = "stars";
    } else if (query.sort === "recent") {
      sort = "updated";
    } else if (query.sort === "name") {
      sort = "name";
      order = "asc";
    }

    try {
      const params = new URLSearchParams({
        q,
        sort: sort === "best-match" ? "" : sort,
        order,
        page: String(page),
        per_page: String(perPage),
      });

      const res = await fetch(
        `${GITHUB_API}/search/repositories?${params.toString()}`,
        {
          headers,
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!res.ok) {
        console.warn(`[GitHub] Search failed: HTTP ${res.status}`);
        return { skills: [], total: 0, page, totalPages: 0 };
      }

      const data = (await res.json()) as any;
      const total = data.total_count ?? 0;
      const totalPages = Math.ceil(total / perPage);

      const skills: ExternalSkillInfo[] = (data.items ?? []).map(
        (repo: any): ExternalSkillInfo => ({
          id: repo.full_name || `${repo.owner?.login}/${repo.name}`,
          name: repo.name || "unknown",
          description: repo.description || "",
          author: repo.owner?.login || "unknown",
          version: "latest",
          source: "github",
          url: repo.html_url || "",
          tags: repo.topics || [],
          popularity: repo.stargazers_count ?? 0,
          updatedAt: repo.updated_at || repo.pushed_at || undefined,
          license: repo.license?.spdx_id || undefined,
        }),
      );

      return { skills, total, page, totalPages };
    } catch (err: any) {
      console.warn(`[GitHub] Search error: ${err?.message || String(err)}`);
      return { skills: [], total: 0, page, totalPages: 0 };
    }
  }

  async getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null> {
    const { owner, repo } = parseGitHubRef(skillId);
    if (!owner || !repo) return null;

    const headers = getGitHubHeaders();

    try {
      const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as any;

      // Try to fetch SKILL.md for description
      let readme: string | undefined;
      try {
        const skillMdRes = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${data.default_branch || "main"}/SKILL.md`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (skillMdRes.ok) {
          readme = await skillMdRes.text();
        }
      } catch {
        // ignore
      }

      // If no SKILL.md, try README
      if (!readme) {
        try {
          const readmeRes = await fetch(
            `${GITHUB_API}/repos/${owner}/${repo}/readme`,
            {
              headers: { ...headers, Accept: "application/vnd.github.raw" },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (readmeRes.ok) {
            readme = await readmeRes.text();
          }
        } catch {
          // ignore
        }
      }

      return {
        id: data.full_name || `${owner}/${repo}`,
        name: data.name || repo,
        description: data.description || "",
        author: data.owner?.login || owner,
        version: "latest",
        source: "github",
        url: data.html_url || `https://github.com/${owner}/${repo}`,
        tags: data.topics || [],
        popularity: data.stargazers_count ?? 0,
        updatedAt: data.updated_at || data.pushed_at || undefined,
        readme,
        license: data.license?.spdx_id || undefined,
      };
    } catch {
      return null;
    }
  }

  async importSkill(
    skillId: string,
    targetDir: string,
  ): Promise<SkillImportResult> {
    const { owner, repo, branch, subpath } = parseGitHubRef(skillId);

    if (!owner || !repo) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Invalid GitHub reference: ${skillId}. Use format: owner/repo`,
      };
    }

    const safeName = `${owner}-${repo}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const installPath = path.join(targetDir, safeName);

    try {
      // Try cloning via git (preferred — gets the full repo)
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      const branchArg = branch ? `--branch ${branch}` : "";
      const { execSync } = await import("child_process");

      // Check if already exists
      try {
        await fs.access(path.join(installPath, "SKILL.md"));
        // Update existing
        try {
          execSync("git pull --ff-only", {
            cwd: installPath,
            encoding: "utf8",
            stdio: "pipe",
            timeout: 60000,
          });
          return {
            ok: true,
            skillId,
            installPath,
            message: `Skill '${safeName}' updated from GitHub (git pull)`,
          };
        } catch {
          // pull failed, re-clone below
        }
      } catch {
        // doesn't exist yet, clone below
      }

      // Clone fresh
      await fs.rm(installPath, { recursive: true, force: true });
      await fs.mkdir(targetDir, { recursive: true });

      execSync(
        `git clone --depth 1 ${branchArg} "${cloneUrl}" "${installPath}"`,
        {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 120000,
        },
      );

      // If subpath, move the sub-directory content up
      if (subpath) {
        const subDir = path.join(installPath, subpath);
        const tmpDir = `${installPath}.__tmp__`;
        await fs.rename(subDir, tmpDir);
        await fs.rm(installPath, { recursive: true, force: true });
        await fs.rename(tmpDir, installPath);
      }

      // Verify SKILL.md exists, otherwise generate one
      try {
        await fs.access(path.join(installPath, "SKILL.md"));
      } catch {
        // Generate a basic SKILL.md from repo metadata
        await generateSkillMd(installPath, {
          name: safeName,
          owner,
          repo,
          skillId,
        });
      }

      return {
        ok: true,
        skillId,
        installPath,
        message: `Skill '${safeName}' imported from GitHub to ${installPath}`,
      };
    } catch (err: any) {
      // Fallback: download tarball
      try {
        return await this.importViaTarball(
          owner,
          repo,
          branch,
          subpath,
          safeName,
          installPath,
          targetDir,
          skillId,
        );
      } catch (fallbackErr: any) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: `Failed to import skill from GitHub`,
          error: `git clone failed: ${err?.message}; tarball fallback failed: ${fallbackErr?.message}`,
        };
      }
    }
  }

  /** Fallback: download as tarball when git clone is not available */
  private async importViaTarball(
    owner: string,
    repo: string,
    branch: string | undefined,
    subpath: string | undefined,
    safeName: string,
    installPath: string,
    targetDir: string,
    skillId: string,
  ): Promise<SkillImportResult> {
    const ref = branch || "main";
    const tarballUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.tar.gz`;

    const res = await fetch(tarballUrl, {
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      throw new Error(`Tarball download failed: HTTP ${res.status}`);
    }

    await fs.mkdir(installPath, { recursive: true });

    const buffer = Buffer.from(await res.arrayBuffer());
    const archivePath = path.join(targetDir, `__${safeName}.tar.gz`);
    await fs.writeFile(archivePath, buffer);

    const { execSync } = await import("child_process");
    execSync(
      `tar -xzf "${archivePath}" -C "${installPath}" --strip-components=1`,
      {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 30000,
      },
    );

    await fs.unlink(archivePath).catch(() => { });

    // Handle subpath
    if (subpath) {
      const subDir = path.join(installPath, subpath);
      const tmpDir = `${installPath}.__tmp__`;
      await fs.rename(subDir, tmpDir);
      await fs.rm(installPath, { recursive: true, force: true });
      await fs.rename(tmpDir, installPath);
    }

    // Verify or generate SKILL.md
    try {
      await fs.access(path.join(installPath, "SKILL.md"));
    } catch {
      await generateSkillMd(installPath, {
        name: safeName,
        owner,
        repo,
        skillId,
      });
    }

    return {
      ok: true,
      skillId,
      installPath,
      message: `Skill '${safeName}' imported from GitHub (tarball) to ${installPath}`,
    };
  }
}

/** Generate a basic SKILL.md if the repo doesn't include one */
async function generateSkillMd(
  installPath: string,
  meta: { name: string; owner: string; repo: string; skillId: string },
): Promise<void> {
  const content = `---
name: ${meta.name}
version: 0.0.0
description: Imported from GitHub (${meta.owner}/${meta.repo})
source: github
sourceUrl: https://github.com/${meta.owner}/${meta.repo}
---

# ${meta.name}

Imported from [${meta.owner}/${meta.repo}](https://github.com/${meta.owner}/${meta.repo}).

> This SKILL.md was auto-generated during import. Edit it to customize the skill description and instructions.
`;
  await fs.writeFile(path.join(installPath, "SKILL.md"), content, "utf8");
}
