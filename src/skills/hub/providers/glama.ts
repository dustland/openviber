/**
 * Glama MCP Server Directory Provider
 *
 * Discovers MCP servers from the Glama directory — a curated list
 * of MCP (Model Context Protocol) servers for AI agents.
 *
 * Registry: https://glama.ai/mcp/servers
 * API: https://glama.ai/api/mcp
 * Override with GLAMA_API_URL env var.
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

const DEFAULT_API_URL = "https://glama.ai/api/mcp";

function getApiUrl(): string {
  return (process.env.GLAMA_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
}

export class GlamaProvider implements SkillHubProvider {
  readonly type = "glama" as const;
  readonly displayName = "Glama (MCP)";

  async search(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const apiUrl = getApiUrl();
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });

    if (query.query) {
      params.set("q", query.query);
    }

    if (query.sort === "popularity") {
      params.set("sort", "stars");
    } else if (query.sort === "recent") {
      params.set("sort", "updated");
    }

    try {
      const res = await fetch(`${apiUrl}/servers?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[Glama] Search failed: HTTP ${res.status}`);
        return { skills: [], total: 0, page, totalPages: 0 };
      }

      const data = (await res.json()) as any;
      const servers = data.servers ?? data.results ?? data.data ?? data.items ?? [];
      const total = data.total ?? data.totalCount ?? servers.length;
      const totalPages = data.totalPages ?? Math.ceil(total / limit);

      const skills: ExternalSkillInfo[] = (Array.isArray(servers) ? servers : []).map(
        (server: any): ExternalSkillInfo => ({
          id: server.id || server.slug || server.name || "unknown",
          name: server.name || server.title || "Untitled",
          description: server.description || server.summary || "",
          author: server.author || server.vendor || server.owner || "unknown",
          version: server.version || "latest",
          source: "glama",
          url: server.homepage || server.url || server.repository || `https://glama.ai/mcp/servers/${server.id || server.slug}`,
          tags: server.tags || server.categories || [],
          popularity: server.stars ?? server.downloads ?? 0,
          updatedAt: server.updatedAt || server.lastModified || undefined,
          license: server.license || undefined,
        }),
      );

      return { skills, total, page, totalPages };
    } catch (err: any) {
      console.warn(`[Glama] Search error: ${err?.message || String(err)}`);
      return { skills: [], total: 0, page, totalPages: 0 };
    }
  }

  async getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null> {
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(
        `${apiUrl}/servers/${encodeURIComponent(skillId)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!res.ok) return null;

      const server = (await res.json()) as any;

      return {
        id: server.id || server.slug || skillId,
        name: server.name || server.title || skillId,
        description: server.description || "",
        author: server.author || server.vendor || "unknown",
        version: server.version || "latest",
        source: "glama",
        url: server.homepage || server.repository || `https://glama.ai/mcp/servers/${server.id || server.slug}`,
        tags: server.tags || [],
        popularity: server.stars ?? 0,
        updatedAt: server.updatedAt || undefined,
        readme: server.readme || server.longDescription || undefined,
        license: server.license || undefined,
        dependencies: server.tools?.map((t: any) => t.name || t) || undefined,
      };
    } catch {
      return null;
    }
  }

  async importSkill(skillId: string, targetDir: string): Promise<SkillImportResult> {
    const apiUrl = getApiUrl();
    const safeName = `glama-${skillId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const installPath = path.join(targetDir, safeName);

    try {
      // Fetch server details
      const res = await fetch(
        `${apiUrl}/servers/${encodeURIComponent(skillId)}`,
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
          message: `MCP server not found on Glama: ${skillId}`,
          error: `HTTP ${res.status}`,
        };
      }

      const server = (await res.json()) as any;
      const repoUrl: string | undefined = server.repository || server.homepage;
      const npmPkg: string | undefined = server.npmPackage || server.package;

      await fs.mkdir(installPath, { recursive: true });

      // Generate SKILL.md
      const toolsList = (server.tools || [])
        .map((t: any) => {
          const name = typeof t === "string" ? t : t.name || "unknown";
          const desc = typeof t === "string" ? "" : t.description || "";
          return `- **${name}**${desc ? ` — ${desc}` : ""}`;
        })
        .join("\n");

      const skillMd = `---
name: ${safeName}
version: ${server.version || "0.0.0"}
description: "${(server.description || "").replace(/"/g, '\\"')}"
source: glama
mcpServer: true
${npmPkg ? `npmPackage: ${npmPkg}` : ""}
${repoUrl ? `repository: ${repoUrl}` : ""}
---

# ${server.name || server.title || safeName}

${server.description || ""}

**Source:** [Glama MCP Directory](https://glama.ai/mcp/servers/${server.id || server.slug || skillId})

## MCP Server

This is an MCP (Model Context Protocol) server discovered from the Glama directory.

${toolsList ? `## Available Tools\n\n${toolsList}` : ""}

${npmPkg ? `## Installation\n\n\`\`\`bash\nnpx ${npmPkg}\n\`\`\`\n` : ""}
${repoUrl ? `## Repository\n\n${repoUrl}\n` : ""}
`;

      await fs.writeFile(path.join(installPath, "SKILL.md"), skillMd, "utf8");

      // If there's a repo URL, clone it
      if (repoUrl) {
        try {
          const { execSync } = await import("child_process");
          const srcDir = path.join(installPath, "src");
          execSync(`git clone --depth 1 "${repoUrl}" "${srcDir}"`, {
            encoding: "utf8",
            stdio: "pipe",
            timeout: 120000,
          });
        } catch {
          // Cloning is optional
        }
      }

      return {
        ok: true,
        skillId,
        installPath,
        message: `MCP server '${server.name || safeName}' imported from Glama to ${installPath}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Failed to import MCP server from Glama`,
        error: err?.message || String(err),
      };
    }
  }
}
