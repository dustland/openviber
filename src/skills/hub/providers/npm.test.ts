/**
 * Tests for npm Skill Provider
 *
 * Tests npm search API integration and skill info retrieval.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NpmProvider } from "./npm";

describe("NpmProvider", () => {
  let provider: NpmProvider;

  beforeEach(() => {
    provider = new NpmProvider();
  });

  it("should have correct type and display name", () => {
    expect(provider.type).toBe("npm");
    expect(provider.displayName).toBe("npm Registry");
  });

  describe("search", () => {
    it("should search npm with openviber-skill keyword", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 2,
            objects: [
              {
                package: {
                  name: "@openviber-skills/web-search",
                  description: "Web search skill for OpenViber",
                  version: "1.2.0",
                  author: { name: "skill-author" },
                  keywords: ["openviber-skill", "search"],
                  links: {
                    npm: "https://www.npmjs.com/package/@openviber-skills/web-search",
                  },
                  date: "2025-06-01T00:00:00Z",
                  license: "MIT",
                },
                score: {
                  detail: { popularity: 0.75 },
                },
              },
              {
                package: {
                  name: "openviber-skill-browser",
                  description: "Browser automation skill",
                  version: "0.5.0",
                  publisher: { username: "browser-dev" },
                  keywords: ["openviber-skill", "browser"],
                  links: {},
                  license: "Apache-2.0",
                },
                score: {
                  detail: { popularity: 0.3 },
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const result = await provider.search({ query: "search" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/-/v1/search");
      expect(url).toContain("openviber-skill");

      expect(result.skills).toHaveLength(2);
      expect(result.skills[0].name).toBe("@openviber-skills/web-search");
      expect(result.skills[0].source).toBe("npm");
      expect(result.skills[0].author).toBe("skill-author");

      expect(result.skills[1].name).toBe("openviber-skill-browser");
      expect(result.skills[1].author).toBe("browser-dev");

      fetchSpy.mockRestore();
    });

    it("should handle empty results", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ total: 0, objects: [] }), {
          status: 200,
        }),
      );

      const result = await provider.search({ query: "nonexistent-xyz" });
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);

      fetchSpy.mockRestore();
    });

    it("should handle API errors gracefully", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Server Error", { status: 500 }),
      );

      const result = await provider.search({ query: "test" });
      expect(result.skills).toHaveLength(0);

      fetchSpy.mockRestore();
    });
  });

  describe("getSkillInfo", () => {
    it("should fetch detailed package info", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "@openviber-skills/web-search",
            description: "Web search skill",
            "dist-tags": { latest: "1.0.0" },
            versions: {
              "1.0.0": {
                dependencies: { zod: "^3.0.0" },
                dist: {
                  tarball:
                    "https://registry.npmjs.org/@openviber-skills/web-search/-/web-search-1.0.0.tgz",
                },
              },
            },
            author: { name: "test-author" },
            keywords: ["openviber-skill"],
            readme: "# Web Search\nSearch the web.",
            license: "MIT",
            time: { "1.0.0": "2025-01-01T00:00:00Z" },
          }),
          { status: 200 },
        ),
      );

      const info = await provider.getSkillInfo(
        "@openviber-skills/web-search",
      );

      expect(info).not.toBeNull();
      expect(info!.name).toBe("@openviber-skills/web-search");
      expect(info!.version).toBe("1.0.0");
      expect(info!.author).toBe("test-author");
      expect(info!.readme).toContain("Web Search");
      expect(info!.dependencies).toContain("zod");
      expect(info!.license).toBe("MIT");

      fetchSpy.mockRestore();
    });

    it("should return null for non-existent package", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );

      const info = await provider.getSkillInfo("nonexistent-package-xyz");
      expect(info).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe("importSkill", () => {
    it("should return error when package not found", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );

      const result = await provider.importSkill(
        "nonexistent-pkg",
        "/tmp/test",
      );
      expect(result.ok).toBe(false);
      expect(result.message).toContain("not found on npm");

      fetchSpy.mockRestore();
    });
  });
});
