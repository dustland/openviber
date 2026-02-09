/**
 * Tests for OpenClaw Skill Hub Provider
 *
 * Tests OpenClaw API search integration, skill info, and import flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenClawProvider } from "./openclaw";

describe("OpenClawProvider", () => {
  let provider: OpenClawProvider;

  beforeEach(() => {
    provider = new OpenClawProvider();
  });

  it("should have correct type and display name", () => {
    expect(provider.type).toBe("openclaw");
    expect(provider.displayName).toBe("OpenClaw Skill Hub");
  });

  describe("search", () => {
    it("should send search query to hub API", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            skills: [
              {
                id: "web-scraper",
                name: "Web Scraper",
                description: "Scrapes websites",
                author: "community",
                version: "2.1.0",
                url: "https://hub.openclaw.org/skills/web-scraper",
                tags: ["scraping", "web"],
                downloads: 1500,
                updatedAt: "2025-05-20T00:00:00Z",
              },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
          }),
          { status: 200 },
        ),
      );

      const result = await provider.search({
        query: "scraper",
        tags: ["web"],
        sort: "popularity",
        page: 1,
        limit: 10,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/skills?");
      expect(url).toContain("q=scraper");
      expect(url).toContain("tags=web");
      expect(url).toContain("sort=popularity");

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].id).toBe("web-scraper");
      expect(result.skills[0].source).toBe("openclaw");
      expect(result.skills[0].popularity).toBe(1500);

      fetchSpy.mockRestore();
    });

    it("should return empty results on API error", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      const result = await provider.search({ query: "test" });
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);

      fetchSpy.mockRestore();
    });

    it("should handle network errors gracefully", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("DNS resolution failed"));

      const result = await provider.search({ query: "test" });
      expect(result.skills).toHaveLength(0);

      fetchSpy.mockRestore();
    });
  });

  describe("getSkillInfo", () => {
    it("should fetch skill details from hub", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "web-scraper",
            name: "Web Scraper",
            description: "Scrapes websites for data extraction",
            author: "community",
            version: "2.1.0",
            url: "https://hub.openclaw.org/skills/web-scraper",
            tags: ["scraping", "web"],
            downloads: 1500,
            readme: "# Web Scraper\nExtracts data from web pages.",
            license: "MIT",
          }),
          { status: 200 },
        ),
      );

      const info = await provider.getSkillInfo("web-scraper");

      expect(info).not.toBeNull();
      expect(info!.id).toBe("web-scraper");
      expect(info!.name).toBe("Web Scraper");
      expect(info!.source).toBe("openclaw");
      expect(info!.readme).toContain("Web Scraper");
      expect(info!.license).toBe("MIT");

      fetchSpy.mockRestore();
    });

    it("should return null for non-existent skill", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );

      const info = await provider.getSkillInfo("nonexistent");
      expect(info).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe("importSkill", () => {
    it("should return error when skill not found on hub", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );

      const result = await provider.importSkill(
        "nonexistent",
        "/tmp/test",
      );
      expect(result.ok).toBe(false);
      expect(result.message).toContain("not found");

      fetchSpy.mockRestore();
    });

    it("should return error when no download URL available", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "broken-skill",
            name: "Broken Skill",
            // No downloadUrl
          }),
          { status: 200 },
        ),
      );

      const result = await provider.importSkill("broken-skill", "/tmp/test");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("No download URL");

      fetchSpy.mockRestore();
    });
  });
});
