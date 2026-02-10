/**
 * Smithery MCP Server Registry Provider
 *
 * Discovers MCP (Model Context Protocol) servers from the Smithery registry.
 * Smithery is a popular directory of MCP servers/tools.
 *
 * Registry API: https://registry.smithery.ai/
 * Override with SMITHERY_REGISTRY_URL env var.
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

const DEFAULT_REGISTRY_URL = "https://registry.smithery.ai";

export class SmitheryProvider implements SkillHubProvider {
  readonly type = "smithery" as const;
  readonly displayName = "Smithery (MCP)";
  private config: SkillHubProviderConfig;

  constructor(config?: SkillHubProviderConfig) {
    this.config = config ?? {};
  }

  setConfig(config?: SkillHubProviderConfig): void {
    this.config = config ?? {};
  }

  private getRegistryUrl(): string {
    return (
      this.config.url ||
      process.env.SMITHERY_REGISTRY_URL ||
      DEFAULT_REGISTRY_URL
    ).replace(/\/$/, "");
  }

  async search(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const registryUrl = this.getRegistryUrl();
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const params = new URLSearchParams({
      pageSize: String(limit),
      page: String(page),
    });

    if (query.query) {
      params.set("q", query.query);
    }

    try {
      const res = await fetch(`${registryUrl}/api/servers?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[Smithery] Search failed: HTTP ${res.status}`);
        return { skills: [], total: 0, page, totalPages: 0 };
      }

      const data = (await res.json()) as any;
      const servers = data.servers ?? data.results ?? data.items ?? [];
      const total = data.totalCount ?? data.total ?? servers.length;
      const totalPages = data.totalPages ?? Math.ceil(total / limit);

      const skills: ExternalSkillInfo[] = servers.map(
        (server: any): ExternalSkillInfo => ({
          id: server.qualifiedName || server.name || server.id || "unknown",
          name: server.displayName || server.name || "Untitled",
          description: server.description || "",
          author: server.vendor || server.author || server.publisher || "unknown",
          version: server.version || "latest",
          source: "smithery",
          url: server.homepage || server.url || `${registryUrl}/server/${server.qualifiedName || server.name}`,
          tags: server.tags || server.categories || [],
          popularity: server.useCount ?? server.downloads ?? server.stars ?? 0,
          updatedAt: server.updatedAt || server.createdAt || undefined,
          license: server.license || undefined,
        }),
      );

      return { skills, total, page, totalPages };
    } catch (err: any) {
      console.warn(`[Smithery] Search error: ${err?.message || String(err)}`);
      return { skills: [], total: 0, page, totalPages: 0 };
    }
  }

  async getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null> {
    const registryUrl = this.getRegistryUrl();

    try {
      const res = await fetch(
        `${registryUrl}/api/servers/${encodeURIComponent(skillId)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!res.ok) return null;

      const server = (await res.json()) as any;

      return {
        id: server.qualifiedName || server.name || skillId,
        name: server.displayName || server.name || skillId,
        description: server.description || "",
        author: server.vendor || server.author || "unknown",
        version: server.version || "latest",
        source: "smithery",
        url: server.homepage || `${registryUrl}/server/${server.qualifiedName || server.name}`,
        tags: server.tags || [],
        popularity: server.useCount ?? 0,
        updatedAt: server.updatedAt || undefined,
        readme: server.readme || server.longDescription || undefined,
        license: server.license || undefined,
        dependencies: server.tools?.map((t: any) => t.name) || undefined,
      };
    } catch {
      return null;
    }
  }

  async importSkill(skillId: string, targetDir: string): Promise<SkillImportResult> {
    const registryUrl = this.getRegistryUrl();
    const safeName = skillId.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
    const installPath = path.join(targetDir, safeName);

    try {
      // Fetch server details to get repository or npm package info
      const res = await fetch(
        `${registryUrl}/api/servers/${encodeURIComponent(skillId)}`,
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
          message: `MCP server not found on Smithery: ${skillId}`,
          error: `HTTP ${res.status}`,
        };
      }

      const server = (await res.json()) as any;

      // Smithery servers typically have a repository URL or npm package
      const repoUrl: string | undefined = server.repository || server.repoUrl || server.homepage;
      const npmPkg: string | undefined = server.npmPackage || server.package;

      await fs.mkdir(installPath, { recursive: true });

      // Generate an MCP-aware SKILL.md with connection instructions
      const toolsList = (server.tools || [])
        .map((t: any) => `- **${t.name}** — ${t.description || ""}`)
        .join("\n");

      const skillMd = `---
name: ${safeName}
version: ${server.version || "0.0.0"}
description: "${(server.description || "").replace(/"/g, '\\"')}"
source: smithery
mcpServer: true
qualifiedName: ${server.qualifiedName || skillId}
${npmPkg ? `npmPackage: ${npmPkg}` : ""}
${repoUrl ? `repository: ${repoUrl}` : ""}
---

# ${server.displayName || safeName}

${server.description || ""}

**Source:** [Smithery Registry](${registryUrl}/server/${server.qualifiedName || skillId})

## MCP Server

This is an MCP (Model Context Protocol) server. It provides tools via the MCP protocol.

${toolsList ? `## Available Tools\n\n${toolsList}` : ""}

${npmPkg ? `## Installation\n\n\`\`\`bash\nnpx ${npmPkg}\n\`\`\`\n` : ""}
${repoUrl ? `## Repository\n\n${repoUrl}\n` : ""}
`;

      await fs.writeFile(path.join(installPath, "SKILL.md"), skillMd, "utf8");

      // If there's an npm package, install it
      if (npmPkg) {
        try {
          const { execSync } = await import("child_process");
          // Create a minimal package.json
          const pkgJson = {
            name: safeName,
            version: "0.0.0",
            private: true,
            dependencies: { [npmPkg]: "latest" },
          };
          await fs.writeFile(
            path.join(installPath, "package.json"),
            JSON.stringify(pkgJson, null, 2),
            "utf8",
          );
          try {
            execSync("pnpm install", {
              cwd: installPath,
              encoding: "utf8",
              stdio: "pipe",
              timeout: 120000,
            });
          } catch {
            execSync("npm install", {
              cwd: installPath,
              encoding: "utf8",
              stdio: "pipe",
              timeout: 120000,
            });
          }
        } catch (installErr: any) {
          console.warn(`[Smithery] npm install warning: ${installErr?.message}`);
        }
      }

      // If there's a repo, clone it into a subdirectory
      if (repoUrl && !npmPkg) {
        try {
          const { execSync } = await import("child_process");
          const srcDir = path.join(installPath, "src");
          execSync(`git clone --depth 1 "${repoUrl}" "${srcDir}"`, {
            encoding: "utf8",
            stdio: "pipe",
            timeout: 120000,
          });
        } catch (cloneErr: any) {
          console.warn(`[Smithery] git clone warning: ${cloneErr?.message}`);
        }
      }

      return {
        ok: true,
        skillId,
        installPath,
        message: `MCP server '${server.displayName || safeName}' imported from Smithery to ${installPath}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Failed to import MCP server from Smithery`,
        error: err?.message || String(err),
      };
    }
  }
}
