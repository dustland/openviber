/**
 * Composio Tool Provider
 *
 * Discovers tools and integrations from the Composio platform.
 * Composio provides 250+ tools covering SaaS integrations (GitHub, Slack,
 * Google, etc.) that can be exposed as agent tools.
 *
 * API: https://backend.composio.dev/api/v2
 * Override with COMPOSIO_API_URL env var.
 * Auth: COMPOSIO_API_KEY env var (optional for search, required for install).
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

const DEFAULT_API_URL = "https://backend.composio.dev/api/v2";

function getApiUrl(): string {
  return (process.env.COMPOSIO_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
}

function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "OpenViber-SkillHub/1.0",
  };
  const key = process.env.COMPOSIO_API_KEY;
  if (key) {
    headers["x-api-key"] = key;
  }
  return headers;
}

export class ComposioProvider implements SkillHubProvider {
  readonly type = "composio" as const;
  readonly displayName = "Composio";

  async search(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const apiUrl = getApiUrl();
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    try {
      // Composio has an apps endpoint that lists available integrations
      const params = new URLSearchParams();

      if (query.query) {
        params.set("search", query.query);
      }

      const res = await fetch(`${apiUrl}/apps?${params.toString()}`, {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[Composio] Search failed: HTTP ${res.status}`);
        return { skills: [], total: 0, page, totalPages: 0 };
      }

      const data = (await res.json()) as any;
      const apps = data.items ?? data.apps ?? data ?? [];

      // Filter and paginate client-side since the API may not support pagination
      let filtered = Array.isArray(apps) ? apps : [];

      if (query.tags?.length) {
        const tagSet = new Set(query.tags.map((t) => t.toLowerCase()));
        filtered = filtered.filter((app: any) =>
          (app.categories || app.tags || []).some((c: string) =>
            tagSet.has(c.toLowerCase()),
          ),
        );
      }

      const total = filtered.length;
      const start = (page - 1) * limit;
      const paged = filtered.slice(start, start + limit);
      const totalPages = Math.ceil(total / limit);

      const skills: ExternalSkillInfo[] = paged.map(
        (app: any): ExternalSkillInfo => ({
          id: app.key || app.appId || app.name || "unknown",
          name: app.name || app.displayName || app.key || "Untitled",
          description: app.description || "",
          author: "Composio",
          version: app.version || "latest",
          source: "composio",
          url: app.docsUrl || app.url || `https://composio.dev/tools/${app.key || app.name}`,
          tags: app.categories || app.tags || [],
          popularity: app.activeConnections ?? 0,
          updatedAt: app.updatedAt || undefined,
          license: "proprietary",
        }),
      );

      return { skills, total, page, totalPages };
    } catch (err: any) {
      console.warn(`[Composio] Search error: ${err?.message || String(err)}`);
      return { skills: [], total: 0, page, totalPages: 0 };
    }
  }

  async getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null> {
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/apps/${encodeURIComponent(skillId)}`, {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return null;

      const app = (await res.json()) as any;

      // Also try to fetch available actions/tools for this app
      let tools: string[] = [];
      try {
        const actionsRes = await fetch(
          `${apiUrl}/actions?appNames=${encodeURIComponent(skillId)}&limit=50`,
          {
            headers: getApiHeaders(),
            signal: AbortSignal.timeout(10000),
          },
        );
        if (actionsRes.ok) {
          const actionsData = (await actionsRes.json()) as any;
          const actions = actionsData.items ?? actionsData ?? [];
          tools = (Array.isArray(actions) ? actions : []).map(
            (a: any) => a.displayName || a.name || a.actionName || "unknown",
          );
        }
      } catch {
        // ignore
      }

      return {
        id: app.key || app.appId || skillId,
        name: app.name || app.displayName || skillId,
        description: app.description || "",
        author: "Composio",
        version: app.version || "latest",
        source: "composio",
        url: app.docsUrl || `https://composio.dev/tools/${app.key || skillId}`,
        tags: app.categories || app.tags || [],
        popularity: app.activeConnections ?? 0,
        updatedAt: app.updatedAt || undefined,
        readme: app.longDescription || undefined,
        license: "proprietary",
        dependencies: tools.length > 0 ? tools : undefined,
      };
    } catch {
      return null;
    }
  }

  async importSkill(skillId: string, targetDir: string): Promise<SkillImportResult> {
    const apiUrl = getApiUrl();
    const safeName = `composio-${skillId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const installPath = path.join(targetDir, safeName);

    try {
      // Fetch app info
      const res = await fetch(`${apiUrl}/apps/${encodeURIComponent(skillId)}`, {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return {
          ok: false,
          skillId,
          installPath: "",
          message: `App not found on Composio: ${skillId}`,
          error: `HTTP ${res.status}`,
        };
      }

      const app = (await res.json()) as any;

      // Fetch actions
      let actions: any[] = [];
      try {
        const actionsRes = await fetch(
          `${apiUrl}/actions?appNames=${encodeURIComponent(skillId)}&limit=100`,
          {
            headers: getApiHeaders(),
            signal: AbortSignal.timeout(10000),
          },
        );
        if (actionsRes.ok) {
          const actionsData = (await actionsRes.json()) as any;
          actions = actionsData.items ?? actionsData ?? [];
          if (!Array.isArray(actions)) actions = [];
        }
      } catch {
        // ignore
      }

      await fs.mkdir(installPath, { recursive: true });

      // Generate SKILL.md with Composio integration details
      const toolsList = actions
        .map((a: any) => `- **${a.displayName || a.name}** — ${a.description || ""}`)
        .join("\n");

      const skillMd = `---
name: ${safeName}
version: ${app.version || "0.0.0"}
description: "${(app.description || "").replace(/"/g, '\\"')}"
source: composio
composioApp: ${skillId}
---

# ${app.name || app.displayName || safeName}

${app.description || ""}

**Source:** [Composio](https://composio.dev/tools/${app.key || skillId})

## Integration

This is a Composio integration. It provides tools for interacting with ${app.name || skillId}.

To use this integration, you need a Composio API key.
Set the \`COMPOSIO_API_KEY\` environment variable.

${toolsList ? `## Available Actions (${actions.length})\n\n${toolsList}` : ""}

## Setup

1. Create a Composio account at [composio.dev](https://composio.dev)
2. Get your API key from the dashboard
3. Set \`COMPOSIO_API_KEY\` in your environment
4. Connect the ${app.name || skillId} app through Composio's auth flow
`;

      await fs.writeFile(path.join(installPath, "SKILL.md"), skillMd, "utf8");

      return {
        ok: true,
        skillId,
        installPath,
        message: `Composio app '${app.name || safeName}' imported to ${installPath}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        skillId,
        installPath: "",
        message: `Failed to import app from Composio`,
        error: err?.message || String(err),
      };
    }
  }
}
