/**
 * npm Skill Provider
 *
 * Imports OpenViber skills published as npm packages.
 *
 * Convention: packages are scoped as `@openviber-skills/<name>` or tagged
 * with the "openviber-skill" keyword in their package.json.
 *
 * Search uses the npm registry search API.
 * Import downloads and extracts the package to ~/.openviber/skills/<name>/
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

const NPM_REGISTRY = "https://registry.npmjs.org";
const NPM_SEARCH = "https://registry.npmjs.org/-/v1/search";

export class NpmProvider implements SkillHubProvider {
  readonly type = "npm" as const;
  readonly displayName = "npm Registry";

  async search(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const page = query.page ?? 1;
    const size = Math.min(query.limit ?? 20, 250);
    const from = (page - 1) * size;

    // Build search text — always include "openviber-skill" keyword
    const textParts: string[] = ["keywords:openviber-skill"];
    if (query.query) textParts.push(query.query);
    if (query.author) textParts.push(`author:${query.author}`);

    const params = new URLSearchParams({
      text: textParts.join(" "),
      size: String(size),
      from: String(from),
    });

    // npm search quality/popularity/maintenance parameters
    if (query.sort === "popularity") {
      params.set("popularity", "1.0");
      params.set("quality", "0.0");
      params.set("maintenance", "0.0");
    } else if (query.sort === "recent") {
      params.set("maintenance", "1.0");
      params.set("quality", "0.0");
      params.set("popularity", "0.0");
    }

    try {
      const res = await fetch(`${NPM_SEARCH}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[npm] Search failed: HTTP ${res.status}`);
        return { skills: [], total: 0, page, totalPages: 0 };
      }

      const data = (await res.json()) as any;
      const total = data.total ?? 0;
      const totalPages = Math.ceil(total / size);

      const skills: ExternalSkillInfo[] = (data.objects ?? []).map(
        (obj: any): ExternalSkillInfo => {
          const pkg = obj.package || {};
          return {
            id: pkg.name || "unknown",
            name: pkg.name || "unknown",
            description: pkg.description || "",
            author:
              (typeof pkg.author === "string"
                ? pkg.author
                : pkg.author?.name) || pkg.publisher?.username || "unknown",
            version: pkg.version || "0.0.0",
            source: "npm",
            url:
              pkg.links?.npm ||
              pkg.links?.homepage ||
              `https://www.npmjs.com/package/${pkg.name}`,
            tags: pkg.keywords || [],
            popularity: Math.round((obj.score?.detail?.popularity ?? 0) * 1000),
            updatedAt: pkg.date || undefined,
            license: pkg.license || undefined,
          };
        },
      );

      return { skills, total, page, totalPages };
    } catch (err: any) {
      console.warn(`[npm] Search error: ${err?.message || String(err)}`);
      return { skills: [], total: 0, page, totalPages: 0 };
    }
  }

  async getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null> {
    try {
      const res = await fetch(
        `${NPM_REGISTRY}/${encodeURIComponent(skillId)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!res.ok) return null;

      const data = (await res.json()) as any;
      const latest = data["dist-tags"]?.latest;
      const latestVersion = latest ? data.versions?.[latest] : null;

      return {
        id: data.name || skillId,
        name: data.name || skillId,
        description: data.description || "",
        author:
          (typeof data.author === "string"
            ? data.author
            : data.author?.name) || "unknown",
        version: latest || "0.0.0",
        source: "npm",
        url: `https://www.npmjs.com/package/${data.name}`,
        tags: data.keywords || [],
        popularity: 0,
        updatedAt: data.time?.[latest] || data.time?.modified || undefined,
        readme: data.readme || undefined,
        license:
          (typeof data.license === "string"
            ? data.license
            : data.license?.type) || undefined,
        dependencies: latestVersion?.dependencies
          ? Object.keys(latestVersion.dependencies)
          : undefined,
      };
    } catch {
      return null;
    }
  }

  async importSkill(
    skillId: string,
    targetDir: string,
  ): Promise<SkillImportResult> {
    try {
      // Fetch package metadata to get tarball URL
      const res = await fetch(
        `${NPM_REGISTRY}/${encodeURIComponent(skillId)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!res.ok) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: `Package not found on npm: ${skillId}`,
          error: `HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as any;
      const latest = data["dist-tags"]?.latest;
      const latestVersion = latest ? data.versions?.[latest] : null;
      const tarball = latestVersion?.dist?.tarball;

      if (!tarball) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: `No tarball found for ${skillId}@${latest || "latest"}`,
        };
      }

      // Create skill directory — use package short name
      const safeName = (data.name || skillId)
        .replace(/^@[^/]+\//, "") // strip scope
        .replace(/[^a-zA-Z0-9_-]/g, "-");
      const installPath = path.join(targetDir, safeName);
      await fs.mkdir(installPath, { recursive: true });

      // Download and extract tarball
      const archiveRes = await fetch(tarball, {
        signal: AbortSignal.timeout(60000),
      });

      if (!archiveRes.ok) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: `Failed to download package tarball`,
          error: `HTTP ${archiveRes.status}`,
        };
      }

      const buffer = Buffer.from(await archiveRes.arrayBuffer());
      const archivePath = path.join(targetDir, `__${safeName}.tgz`);
      await fs.writeFile(archivePath, buffer);

      const { execSync } = await import("child_process");

      // npm tarballs have a "package/" prefix directory
      execSync(
        `tar -xzf "${archivePath}" -C "${installPath}" --strip-components=1`,
        {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 30000,
        },
      );

      await fs.unlink(archivePath).catch(() => { });

      // Install dependencies if package.json exists
      try {
        await fs.access(path.join(installPath, "package.json"));
        try {
          execSync("pnpm install --prod", {
            cwd: installPath,
            encoding: "utf8",
            stdio: "pipe",
            timeout: 120000,
          });
        } catch {
          // Try npm if pnpm is not available
          try {
            execSync("npm install --production", {
              cwd: installPath,
              encoding: "utf8",
              stdio: "pipe",
              timeout: 120000,
            });
          } catch {
            console.warn(`[npm] Failed to install dependencies for ${skillId}`);
          }
        }
      } catch {
        // No package.json — skip dependency install
      }

      // Verify or generate SKILL.md
      try {
        await fs.access(path.join(installPath, "SKILL.md"));
      } catch {
        await generateSkillMdFromPkg(installPath, data);
      }

      return {
        ok: true,
        skillId,
        installPath,
        message: `Skill '${safeName}' imported from npm (${skillId}@${latest || "latest"}) to ${installPath}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Failed to import skill from npm`,
        error: err?.message || String(err),
      };
    }
  }
}

/** Generate a SKILL.md from npm package.json metadata */
async function generateSkillMdFromPkg(
  installPath: string,
  pkgData: any,
): Promise<void> {
  const name = (pkgData.name || "unknown")
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
  const content = `---
name: ${name}
version: ${pkgData["dist-tags"]?.latest || "0.0.0"}
description: ${pkgData.description || `Imported from npm (${pkgData.name})`}
source: npm
sourcePackage: ${pkgData.name || "unknown"}
---

# ${name}

${pkgData.description || ""}

Imported from [npm](https://www.npmjs.com/package/${pkgData.name}).

> This SKILL.md was auto-generated during import. Edit it to customize the skill description and instructions.
`;
  await fs.writeFile(path.join(installPath, "SKILL.md"), content, "utf8");
}
