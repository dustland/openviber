/**
 * OpenClaw Skill Hub Provider
 *
 * Connects to the OpenClaw community skill registry — a public REST API
 * where users publish and discover OpenViber skills.
 *
 * Default endpoint: https://hub.openclaw.org/api/v1
 * Override with OPENCLAW_HUB_URL environment variable.
 */

import type {
  SkillHubProvider,
  SkillSearchQuery,
  SkillSearchResult,
  ExternalSkillInfo,
  SkillImportResult,
  SkillHubProviderConfig,
} from "../types";
import * as fs from "fs/promises";
import * as path from "path";

const DEFAULT_HUB_URL = "https://hub.openclaw.org/api/v1";

export class OpenClawProvider implements SkillHubProvider {
  readonly type = "openclaw" as const;
  readonly displayName = "OpenClaw Skill Hub";
  private config: SkillHubProviderConfig;

  constructor(config?: SkillHubProviderConfig) {
    this.config = config ?? {};
  }

  setConfig(config?: SkillHubProviderConfig): void {
    this.config = config ?? {};
  }

  private getHubUrl(): string {
    return (
      this.config.url ||
      process.env.OPENCLAW_HUB_URL ||
      DEFAULT_HUB_URL
    ).replace(/\/$/, "");
  }

  async search(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const hubUrl = this.getHubUrl();
    const params = new URLSearchParams();

    if (query.query) params.set("q", query.query);
    if (query.tags?.length) params.set("tags", query.tags.join(","));
    if (query.author) params.set("author", query.author);
    if (query.sort) params.set("sort", query.sort);
    params.set("page", String(query.page ?? 1));
    params.set("limit", String(query.limit ?? 20));

    try {
      const res = await fetch(`${hubUrl}/skills?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[OpenClaw] Search failed: HTTP ${res.status}`);
        return { skills: [], total: 0, page: 1, totalPages: 0 };
      }

      const data = (await res.json()) as any;

      return {
        skills: (data.skills ?? data.results ?? []).map(mapOpenClawSkill),
        total: data.total ?? 0,
        page: data.page ?? 1,
        totalPages: data.totalPages ?? data.total_pages ?? 0,
      };
    } catch (err: any) {
      console.warn(`[OpenClaw] Search error: ${err?.message || String(err)}`);
      return { skills: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  async getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null> {
    const hubUrl = this.getHubUrl();

    try {
      const res = await fetch(`${hubUrl}/skills/${encodeURIComponent(skillId)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as any;
      return mapOpenClawSkill(data);
    } catch {
      return null;
    }
  }

  async importSkill(skillId: string, targetDir: string): Promise<SkillImportResult> {
    const hubUrl = this.getHubUrl();

    try {
      // Fetch the skill tarball / archive from OpenClaw hub
      const infoRes = await fetch(`${hubUrl}/skills/${encodeURIComponent(skillId)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!infoRes.ok) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: `Skill not found on OpenClaw hub`,
          error: `HTTP ${infoRes.status}`,
        };
      }

      const info = (await infoRes.json()) as any;
      const downloadUrl: string = info.downloadUrl || info.download_url || info.tarball;

      if (!downloadUrl) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: "No download URL available for this skill",
        };
      }

      // Download the skill archive
      const archiveRes = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(60000),
      });

      if (!archiveRes.ok) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: `Failed to download skill archive`,
          error: `HTTP ${archiveRes.status}`,
        };
      }

      const safeName = (info.name || skillId).replace(/[^a-zA-Z0-9_-]/g, "-");
      const installPath = path.join(targetDir, safeName);
      await fs.mkdir(installPath, { recursive: true });

      // Write the archive to a temp file and extract
      const buffer = Buffer.from(await archiveRes.arrayBuffer());
      const archivePath = path.join(installPath, "__download.tar.gz");
      await fs.writeFile(archivePath, buffer);

      const { execSync } = await import("child_process");
      execSync(`tar -xzf "${archivePath}" -C "${installPath}" --strip-components=1`, {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 30000,
      });

      // Clean up archive
      await fs.unlink(archivePath).catch(() => { });

      return {
        ok: true,
        skillId,
        installPath,
        message: `Skill '${safeName}' imported from OpenClaw to ${installPath}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Failed to import skill from OpenClaw`,
        error: err?.message || String(err),
      };
    }
  }
}

/** Map an OpenClaw API response to our ExternalSkillInfo type */
function mapOpenClawSkill(raw: any): ExternalSkillInfo {
  return {
    id: raw.id || raw.slug || raw.name || "unknown",
    name: raw.name || raw.title || "Untitled Skill",
    description: raw.description || raw.summary || "",
    author: raw.author || raw.publisher || raw.owner || "unknown",
    version: raw.version || raw.latest_version || "0.0.0",
    source: "openclaw",
    url: raw.url || raw.homepage || "",
    tags: raw.tags || raw.categories || [],
    popularity: raw.downloads ?? raw.stars ?? 0,
    updatedAt: raw.updatedAt || raw.updated_at || undefined,
    readme: raw.readme || undefined,
    license: raw.license || undefined,
    dependencies: raw.dependencies || undefined,
  };
}
