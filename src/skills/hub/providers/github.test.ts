/**
 * Tests for GitHub Skill Provider
 *
 * Tests GitHub reference parsing, search query construction, and import flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubProvider } from "./github";

describe("GitHubProvider", () => {
  let provider: GitHubProvider;

  beforeEach(() => {
    provider = new GitHubProvider();
  });

  it("should have correct type and display name", () => {
    expect(provider.type).toBe("github");
    expect(provider.displayName).toBe("GitHub");
  });

  describe("search", () => {
    it("should construct search query with openviber-skill topic", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total_count: 1,
            items: [
              {
                full_name: "test/skill",
                name: "skill",
                description: "A test skill",
                owner: { login: "test" },
                html_url: "https://github.com/test/skill",
                topics: ["openviber-skill"],
                stargazers_count: 42,
                updated_at: "2025-01-01T00:00:00Z",
                license: { spdx_id: "MIT" },
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const result = await provider.search({ query: "web scraping" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("search/repositories");
      expect(url).toContain("openviber-skill");
      expect(url).toContain("web+scraping");

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].id).toBe("test/skill");
      expect(result.skills[0].source).toBe("github");
      expect(result.skills[0].popularity).toBe(42);

      fetchSpy.mockRestore();
    });

    it("should handle GitHub API errors gracefully", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Rate limit exceeded", { status: 403 }),
      );

      const result = await provider.search({ query: "test" });
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);

      fetchSpy.mockRestore();
    });

    it("should handle network errors gracefully", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("Network error"));

      const result = await provider.search({ query: "test" });
      expect(result.skills).toHaveLength(0);

      fetchSpy.mockRestore();
    });
  });

  describe("getSkillInfo", () => {
    it("should fetch repo info and SKILL.md", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          // First call: repo info
          new Response(
            JSON.stringify({
              full_name: "owner/skill-name",
              name: "skill-name",
              description: "A cool skill",
              owner: { login: "owner" },
              html_url: "https://github.com/owner/skill-name",
              default_branch: "main",
              topics: ["openviber-skill", "automation"],
              stargazers_count: 100,
              updated_at: "2025-06-01T00:00:00Z",
              license: { spdx_id: "MIT" },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          // Second call: SKILL.md
          new Response("# My Skill\nDoes cool things.", { status: 200 }),
        );

      const info = await provider.getSkillInfo("owner/skill-name");

      expect(info).not.toBeNull();
      expect(info!.id).toBe("owner/skill-name");
      expect(info!.author).toBe("owner");
      expect(info!.readme).toContain("My Skill");
      expect(info!.license).toBe("MIT");

      fetchSpy.mockRestore();
    });

    it("should return null for invalid reference", async () => {
      const info = await provider.getSkillInfo("");
      expect(info).toBeNull();
    });

    it("should return null when repo is not found", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );

      const info = await provider.getSkillInfo("nonexistent/repo");
      expect(info).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe("importSkill", () => {
    it("should reject invalid GitHub reference", async () => {
      const result = await provider.importSkill("", "/tmp/test");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("Invalid GitHub reference");
    });
  });
});
