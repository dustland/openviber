/**
 * Hugging Face Spaces Skill Provider
 *
 * Discovers and imports OpenViber-compatible skills published on
 * Hugging Face Spaces. Searches for spaces tagged with "openviber-skill".
 *
 * Uses the Hugging Face Hub API:
 *   https://huggingface.co/docs/hub/api
 *
 * Override endpoint with HUGGINGFACE_API_URL env var.
 * Provide a token via HUGGINGFACE_TOKEN for higher rate limits.
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

const HF_API = "https://huggingface.co/api";

function getHfHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "OpenViber-SkillHub/1.0",
  };
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export class HuggingFaceProvider implements SkillHubProvider {
  readonly type = "huggingface" as const;
  readonly displayName = "Hugging Face";

  async search(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const limit = Math.min(query.limit ?? 20, 100);
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    // Search for models/repos tagged with openviber-skill
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      // Filter by the openviber-skill tag
      filter: "openviber-skill",
    });

    if (query.query) {
      params.set("search", query.query);
    }

    if (query.sort === "popularity") {
      params.set("sort", "likes");
      params.set("direction", "-1");
    } else if (query.sort === "recent") {
      params.set("sort", "lastModified");
      params.set("direction", "-1");
    }

    if (query.author) {
      params.set("author", query.author);
    }

    try {
      const res = await fetch(`${HF_API}/models?${params.toString()}`, {
        headers: getHfHeaders(),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[HuggingFace] Search failed: HTTP ${res.status}`);
        return { skills: [], total: 0, page, totalPages: 0 };
      }

      const data = (await res.json()) as any[];

      const skills: ExternalSkillInfo[] = (data ?? []).map(
        (model: any): ExternalSkillInfo => ({
          id: model.modelId || model.id || "unknown",
          name: (model.modelId || model.id || "").split("/").pop() || "unknown",
          description: model.description || model.cardData?.description || "",
          author: model.author || (model.modelId || "").split("/")[0] || "unknown",
          version: model.sha?.slice(0, 8) || "latest",
          source: "huggingface",
          url: `https://huggingface.co/${model.modelId || model.id}`,
          tags: model.tags || [],
          popularity: model.likes ?? model.downloads ?? 0,
          updatedAt: model.lastModified || undefined,
          license: model.cardData?.license || undefined,
        }),
      );

      // HF API doesn't return total count in list endpoint easily
      const total = skills.length >= limit ? limit * 10 : skills.length; // estimate
      const totalPages = Math.ceil(total / limit);

      return { skills, total, page, totalPages };
    } catch (err: any) {
      console.warn(`[HuggingFace] Search error: ${err?.message || String(err)}`);
      return { skills: [], total: 0, page, totalPages: 0 };
    }
  }

  async getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null> {
    try {
      const res = await fetch(`${HF_API}/models/${encodeURIComponent(skillId)}`, {
        headers: getHfHeaders(),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return null;

      const model = (await res.json()) as any;

      // Try to fetch README
      let readme: string | undefined;
      try {
        const readmeRes = await fetch(
          `https://huggingface.co/${skillId}/raw/main/README.md`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (readmeRes.ok) {
          readme = await readmeRes.text();
        }
      } catch {
        // ignore
      }

      return {
        id: model.modelId || model.id || skillId,
        name: (model.modelId || skillId).split("/").pop() || skillId,
        description: model.description || model.cardData?.description || "",
        author: model.author || skillId.split("/")[0] || "unknown",
        version: model.sha?.slice(0, 8) || "latest",
        source: "huggingface",
        url: `https://huggingface.co/${model.modelId || skillId}`,
        tags: model.tags || [],
        popularity: model.likes ?? model.downloads ?? 0,
        updatedAt: model.lastModified || undefined,
        readme,
        license: model.cardData?.license || undefined,
      };
    } catch {
      return null;
    }
  }

  async importSkill(skillId: string, targetDir: string): Promise<SkillImportResult> {
    const safeName = skillId.replace(/\//g, "-").replace(/[^a-zA-Z0-9_-]/g, "-");
    const installPath = path.join(targetDir, safeName);

    try {
      const { execSync } = await import("child_process");

      // Try git clone via HF Hub (preferred)
      const cloneUrl = `https://huggingface.co/${skillId}`;

      // Check if already exists
      try {
        await fs.access(path.join(installPath, "SKILL.md"));
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
            message: `Skill '${safeName}' updated from Hugging Face`,
          };
        } catch {
          // Continue to re-clone
        }
      } catch {
        // Doesn't exist yet
      }

      await fs.rm(installPath, { recursive: true, force: true });
      await fs.mkdir(targetDir, { recursive: true });

      execSync(`git clone --depth 1 "${cloneUrl}" "${installPath}"`, {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 120000,
      });

      // Generate SKILL.md if missing
      try {
        await fs.access(path.join(installPath, "SKILL.md"));
      } catch {
        const content = `---
name: ${safeName}
version: 0.0.0
description: Imported from Hugging Face (${skillId})
source: huggingface
sourceUrl: https://huggingface.co/${skillId}
---

# ${safeName}

Imported from [Hugging Face](https://huggingface.co/${skillId}).

> This SKILL.md was auto-generated during import.
`;
        await fs.writeFile(path.join(installPath, "SKILL.md"), content, "utf8");
      }

      return {
        ok: true,
        skillId,
        installPath,
        message: `Skill '${safeName}' imported from Hugging Face to ${installPath}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Failed to import skill from Hugging Face`,
        error: err?.message || String(err),
      };
    }
  }
}
