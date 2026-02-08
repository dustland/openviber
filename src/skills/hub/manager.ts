/**
 * Skill Hub Manager
 *
 * Central orchestrator for exploring and importing skills from external sources.
 * Aggregates results from multiple providers (OpenClaw, GitHub, npm) and
 * manages the local skill install lifecycle.
 */

import * as path from "path";
import * as fs from "fs/promises";
import { getViberRoot } from "../../config";
import type {
  SkillHubProvider,
  SkillHubProviderType,
  SkillSearchQuery,
  SkillSearchResult,
  ExternalSkillInfo,
  SkillImportResult,
} from "./types";
import {
  OpenClawProvider,
  GitHubProvider,
  NpmProvider,
  HuggingFaceProvider,
  SmitheryProvider,
  ComposioProvider,
  GlamaProvider,
} from "./providers";

/** Per-provider settings that can be toggled in the settings page */
export interface SkillSourceSettings {
  /** Whether this source is enabled */
  enabled: boolean;
  /** Custom API/registry URL override (empty = use default) */
  url?: string;
  /** API key / token (for providers that need one) */
  apiKey?: string;
}

/** Full settings map for all skill sources */
export type SkillSourcesConfig = Partial<
  Record<SkillHubProviderType, SkillSourceSettings>
>;

/** Default source settings — all enabled, no custom URLs */
export function getDefaultSourcesConfig(): SkillSourcesConfig {
  return {
    openclaw: { enabled: true },
    github: { enabled: true },
    npm: { enabled: true },
    huggingface: { enabled: true },
    smithery: { enabled: true },
    composio: { enabled: false },
    glama: { enabled: true },
  };
}

export class SkillHubManager {
  private providers = new Map<SkillHubProviderType, SkillHubProvider>();
  private sourcesConfig: SkillSourcesConfig;

  constructor(sourcesConfig?: SkillSourcesConfig) {
    this.sourcesConfig = sourcesConfig || getDefaultSourcesConfig();

    // Register all providers
    this.registerProvider(new OpenClawProvider());
    this.registerProvider(new GitHubProvider());
    this.registerProvider(new NpmProvider());
    this.registerProvider(new HuggingFaceProvider());
    this.registerProvider(new SmitheryProvider());
    this.registerProvider(new ComposioProvider());
    this.registerProvider(new GlamaProvider());
  }

  /** Update source settings at runtime */
  updateSourcesConfig(config: SkillSourcesConfig): void {
    this.sourcesConfig = config;
  }

  /** Get current sources config */
  getSourcesConfig(): SkillSourcesConfig {
    return { ...this.sourcesConfig };
  }

  /** Check if a source is enabled */
  isSourceEnabled(type: SkillHubProviderType): boolean {
    const cfg = this.sourcesConfig[type];
    // Default to enabled for backwards compat if not specified
    return cfg?.enabled !== false;
  }

  /** Get all enabled provider types */
  getEnabledProviderTypes(): SkillHubProviderType[] {
    return Array.from(this.providers.keys()).filter((t) =>
      this.isSourceEnabled(t),
    );
  }

  /** Register a custom provider */
  registerProvider(provider: SkillHubProvider): void {
    this.providers.set(provider.type, provider);
  }

  /** Get a provider by type */
  getProvider(type: SkillHubProviderType): SkillHubProvider | undefined {
    return this.providers.get(type);
  }

  /** List available provider types */
  getProviderTypes(): SkillHubProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Search for skills across one or all providers.
   * If `source` is specified, only that provider is queried.
   * Otherwise, all providers are queried in parallel and results are merged.
   */
  async search(
    query: SkillSearchQuery,
    source?: SkillHubProviderType,
  ): Promise<SkillSearchResult> {
    if (source) {
      const provider = this.providers.get(source);
      if (!provider) {
        return { skills: [], total: 0, page: 1, totalPages: 0 };
      }
      return provider.search(query);
    }

    // Query all enabled providers in parallel
    const providerArray = Array.from(this.providers.values()).filter((p) =>
      this.isSourceEnabled(p.type),
    );
    const results = await Promise.allSettled(
      providerArray.map((p) => p.search(query)),
    );

    // Merge results
    const allSkills: ExternalSkillInfo[] = [];
    let totalAcross = 0;

    for (const result of results) {
      if (result.status === "fulfilled") {
        allSkills.push(...result.value.skills);
        totalAcross += result.value.total;
      }
    }

    // Sort merged results
    if (query.sort === "popularity") {
      allSkills.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else if (query.sort === "recent") {
      allSkills.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
    } else if (query.sort === "name") {
      allSkills.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Apply pagination to merged results
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const start = (page - 1) * limit;
    const paged = allSkills.slice(start, start + limit);

    return {
      skills: paged,
      total: totalAcross,
      page,
      totalPages: Math.ceil(totalAcross / limit),
    };
  }

  /**
   * Get detailed info about a skill from a specific provider.
   */
  async getSkillInfo(
    skillId: string,
    source: SkillHubProviderType,
  ): Promise<ExternalSkillInfo | null> {
    const provider = this.providers.get(source);
    if (!provider) return null;
    return provider.getSkillInfo(skillId);
  }

  /**
   * Import a skill from an external source into the local skills directory.
   *
   * Auto-detects source based on the skill identifier:
   *   - Starts with "npm:" → npm
   *   - Contains "/" and looks like owner/repo → GitHub
   *   - Otherwise → OpenClaw
   *
   * Or specify `source` explicitly.
   */
  async importSkill(
    skillId: string,
    options?: {
      source?: SkillHubProviderType;
      targetDir?: string;
    },
  ): Promise<SkillImportResult> {
    const source = options?.source ?? detectSource(skillId);
    const provider = this.providers.get(source);

    if (!provider) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Unknown source: ${source}`,
        error: `No provider registered for '${source}'`,
      };
    }

    // Determine target directory
    const targetDir =
      options?.targetDir || path.join(getViberRoot(), "skills");
    await fs.mkdir(targetDir, { recursive: true });

    // Strip source prefix if present
    const cleanId = skillId.replace(
      /^(npm:|github:|openclaw:|huggingface:|hf:|smithery:|composio:|glama:)/,
      "",
    );

    console.log(
      `[SkillHub] Importing '${cleanId}' from ${provider.displayName}...`,
    );

    const result = await provider.importSkill(cleanId, targetDir);

    if (result.ok) {
      console.log(`[SkillHub] ✓ ${result.message}`);
    } else {
      console.error(
        `[SkillHub] ✗ ${result.message}${result.error ? `: ${result.error}` : ""}`,
      );
    }

    return result;
  }

  /**
   * List locally installed external skills (in ~/.openviber/skills/).
   */
  async listInstalled(): Promise<
    Array<{ name: string; dir: string; source?: string; version?: string }>
  > {
    const skillsDir = path.join(getViberRoot(), "skills");

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skills: Array<{
        name: string;
        dir: string;
        source?: string;
        version?: string;
      }> = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(skillsDir, entry.name);

        try {
          const skillMd = await fs.readFile(
            path.join(skillDir, "SKILL.md"),
            "utf8",
          );

          // Parse frontmatter
          const parts = skillMd.split(/^---$/m);
          let source: string | undefined;
          let version: string | undefined;
          let name = entry.name;

          if (parts.length >= 3) {
            const { default: YAML } = await import("yaml");
            const meta = YAML.parse(parts[1]);
            name = meta?.name || entry.name;
            source = meta?.source || undefined;
            version = meta?.version || undefined;
          }

          skills.push({ name, dir: skillDir, source, version });
        } catch {
          // No SKILL.md — skip
        }
      }

      return skills;
    } catch {
      return [];
    }
  }

  /**
   * Remove a locally installed skill.
   */
  async removeSkill(skillName: string): Promise<{
    ok: boolean;
    message: string;
  }> {
    const skillsDir = path.join(getViberRoot(), "skills");
    const skillDir = path.join(skillsDir, skillName);

    try {
      await fs.access(skillDir);
      await fs.rm(skillDir, { recursive: true, force: true });
      return {
        ok: true,
        message: `Skill '${skillName}' removed from ${skillDir}`,
      };
    } catch {
      return {
        ok: false,
        message: `Skill '${skillName}' not found in ${skillsDir}`,
      };
    }
  }
}

/**
 * Auto-detect the source provider from the skill identifier format.
 */
function detectSource(skillId: string): SkillHubProviderType {
  // Explicit prefix
  if (skillId.startsWith("npm:")) return "npm";
  if (skillId.startsWith("github:")) return "github";
  if (skillId.startsWith("openclaw:")) return "openclaw";
  if (skillId.startsWith("huggingface:") || skillId.startsWith("hf:")) return "huggingface";
  if (skillId.startsWith("smithery:")) return "smithery";
  if (skillId.startsWith("composio:")) return "composio";
  if (skillId.startsWith("glama:")) return "glama";

  // npm scoped package (e.g. @openviber-skills/web-search)
  if (skillId.startsWith("@")) return "npm";

  // Hugging Face URL
  if (skillId.includes("huggingface.co")) return "huggingface";

  // GitHub-style owner/repo (exactly 2 segments, no dots)
  const segments = skillId.split("/").filter(Boolean);
  if (segments.length >= 2 && !skillId.includes(".")) {
    return "github";
  }

  // GitHub URL
  if (skillId.includes("github.com")) return "github";

  // npm-style package name (lowercase, dashes, no slashes)
  if (/^[a-z0-9@][a-z0-9._-]*$/.test(skillId)) return "npm";

  // Default: try OpenClaw
  return "openclaw";
}

/** Singleton instance */
let _manager: SkillHubManager | null = null;

/** Get the shared SkillHubManager instance */
export function getSkillHubManager(): SkillHubManager {
  if (!_manager) {
    _manager = new SkillHubManager();
  }
  return _manager;
}

/**
 * Get the shared SkillHubManager instance, loading settings from disk.
 * Use this async version when you want settings to be applied on first load.
 */
export async function getSkillHubManagerWithSettings(): Promise<SkillHubManager> {
  if (!_manager) {
    const { loadSkillSourcesConfig } = await import("./settings");
    const config = await loadSkillSourcesConfig();
    _manager = new SkillHubManager(config);
  }
  return _manager;
}
