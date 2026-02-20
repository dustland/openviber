/**
 * Tests for SkillHubManager
 *
 * Tests the manager's provider coordination, source detection, and
 * result merging. Uses mock fetch responses for provider tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillHubManager } from "./manager";
import * as path from "path";
import * as os from "os";

vi.mock("../../utils/paths", () => ({
  getViberRoot: () => path.join(os.tmpdir(), `openviber-test-manager-${process.pid}`),
}));

import type {
  SkillHubProvider,
  SkillSearchQuery,
  SkillSearchResult,
  ExternalSkillInfo,
  SkillImportResult,
} from "./types";

/** A minimal mock provider for testing */
function createMockProvider(
  type: "openclaw" | "github" | "npm",
  skills: ExternalSkillInfo[] = [],
): SkillHubProvider {
  return {
    type,
    displayName: `Mock ${type}`,
    search: vi.fn(async (query: SkillSearchQuery): Promise<SkillSearchResult> => {
      const filtered = query.query
        ? skills.filter(
            (s) =>
              s.name.includes(query.query!) ||
              s.description.includes(query.query!),
          )
        : skills;
      return {
        skills: filtered,
        total: filtered.length,
        page: query.page ?? 1,
        totalPages: 1,
      };
    }),
    getSkillInfo: vi.fn(async (id: string) => {
      return skills.find((s) => s.id === id) || null;
    }),
    importSkill: vi.fn(
      async (id: string, targetDir: string): Promise<SkillImportResult> => ({
        ok: true,
        skillId: id,
        installPath: `${targetDir}/${id}`,
        message: `Imported ${id}`,
      }),
    ),
  };
}

function makeSkill(
  overrides: Partial<ExternalSkillInfo>,
): ExternalSkillInfo {
  return {
    id: "test-skill",
    name: "test-skill",
    description: "A test skill",
    author: "tester",
    version: "1.0.0",
    source: "github",
    url: "https://example.com",
    tags: [],
    ...overrides,
  };
}

describe("SkillHubManager", () => {
  let manager: SkillHubManager;

  beforeEach(() => {
    // Initialize with all disabled to prevent real network calls from unmocked providers
    manager = new SkillHubManager({
      openclaw: { enabled: false },
      github: { enabled: false },
      npm: { enabled: false },
      huggingface: { enabled: false },
      smithery: { enabled: false },
      composio: { enabled: false },
      glama: { enabled: false },
    });
  });

  it("should register default providers", () => {
    const types = manager.getProviderTypes();
    expect(types).toContain("openclaw");
    expect(types).toContain("github");
    expect(types).toContain("npm");
  });

  it("should allow registering a custom provider", () => {
    const mockProvider = createMockProvider("openclaw");
    manager.registerProvider(mockProvider);
    expect(manager.getProvider("openclaw")).toBe(mockProvider);
  });

  describe("search", () => {
    it("should search a specific provider when source is specified", async () => {
      // Enable specific providers for this test
      manager.updateSourcesConfig({
        ...manager.getSourcesConfig(),
        github: { enabled: true },
        npm: { enabled: true },
      });

      const githubSkills = [
        makeSkill({ id: "gh-skill-1", name: "gh-skill-1", source: "github" }),
      ];
      const npmSkills = [
        makeSkill({ id: "npm-skill-1", name: "npm-skill-1", source: "npm" }),
      ];

      manager.registerProvider(createMockProvider("github", githubSkills));
      manager.registerProvider(createMockProvider("npm", npmSkills));

      const result = await manager.search({ query: "skill" }, "github");
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].id).toBe("gh-skill-1");
    });

    it("should search all providers when no source is specified", async () => {
      // Enable relevant providers
      manager.updateSourcesConfig({
        ...manager.getSourcesConfig(),
        github: { enabled: true },
        npm: { enabled: true },
        openclaw: { enabled: true },
      });

      const githubSkills = [
        makeSkill({ id: "gh-1", name: "gh-browser", source: "github" }),
      ];
      const npmSkills = [
        makeSkill({ id: "npm-1", name: "npm-browser", source: "npm" }),
      ];
      const openclawSkills = [
        makeSkill({
          id: "oc-1",
          name: "oc-browser",
          source: "openclaw",
        }),
      ];

      manager.registerProvider(createMockProvider("github", githubSkills));
      manager.registerProvider(createMockProvider("npm", npmSkills));
      manager.registerProvider(
        createMockProvider("openclaw", openclawSkills),
      );

      const result = await manager.search({ query: "browser" });
      expect(result.skills).toHaveLength(3);
    });

    it("should sort merged results by popularity", async () => {
      // Enable providers
      manager.updateSourcesConfig({
        ...manager.getSourcesConfig(),
        github: { enabled: true },
        npm: { enabled: true },
      });

      const skills1 = [
        makeSkill({ id: "a", name: "a", popularity: 10, source: "github" }),
      ];
      const skills2 = [
        makeSkill({ id: "b", name: "b", popularity: 100, source: "npm" }),
      ];

      manager.registerProvider(createMockProvider("github", skills1));
      manager.registerProvider(createMockProvider("npm", skills2));

      const result = await manager.search({
        query: "",
        sort: "popularity",
      });
      expect(result.skills[0].id).toBe("b");
      expect(result.skills[1].id).toBe("a");
    });

    it("should handle provider errors gracefully", async () => {
      // Enable providers
      manager.updateSourcesConfig({
        ...manager.getSourcesConfig(),
        github: { enabled: true },
        npm: { enabled: true },
      });

      const failing: SkillHubProvider = {
        type: "github",
        displayName: "Failing GitHub",
        search: vi.fn(async () => {
          throw new Error("Network error");
        }),
        getSkillInfo: vi.fn(async () => null),
        importSkill: vi.fn(async () => ({
          ok: false,
          skillId: "",
          installPath: "",
          message: "fail",
        })),
      };

      const npmSkills = [
        makeSkill({ id: "npm-1", name: "npm-1", source: "npm" }),
      ];

      manager.registerProvider(failing);
      manager.registerProvider(createMockProvider("npm", npmSkills));

      // Should not throw, should return npm results
      const result = await manager.search({});
      expect(result.skills.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getSkillInfo", () => {
    it("should delegate to the correct provider", async () => {
      const skill = makeSkill({
        id: "my-skill",
        readme: "# My Skill\nDoes things.",
      });
      const mockProvider = createMockProvider("github", [skill]);
      manager.registerProvider(mockProvider);

      const info = await manager.getSkillInfo("my-skill", "github");
      expect(info).not.toBeNull();
      expect(info!.id).toBe("my-skill");
      expect(info!.readme).toContain("My Skill");
    });

    it("should return null for unknown provider", async () => {
      const info = await manager.getSkillInfo(
        "anything",
        "unknown" as any,
      );
      expect(info).toBeNull();
    });
  });

  describe("importSkill", () => {
    it("should import from specified source", async () => {
      const mock = createMockProvider("npm");
      manager.registerProvider(mock);

      const result = await manager.importSkill("my-pkg", {
        source: "npm",
        targetDir: "/tmp/test-skills",
      });
      expect(result.ok).toBe(true);
      expect(mock.importSkill).toHaveBeenCalledWith(
        "my-pkg",
        "/tmp/test-skills",
      );
    });

    it("should auto-detect GitHub source for owner/repo format", async () => {
      const mock = createMockProvider("github");
      manager.registerProvider(mock);

      const result = await manager.importSkill("dustland/my-skill", {
        targetDir: "/tmp/test-skills",
      });
      expect(result.ok).toBe(true);
      expect(mock.importSkill).toHaveBeenCalledWith(
        "dustland/my-skill",
        "/tmp/test-skills",
      );
    });

    it("should auto-detect npm source for scoped packages", async () => {
      const mock = createMockProvider("npm");
      manager.registerProvider(mock);

      const result = await manager.importSkill(
        "@openviber-skills/web-search",
        {
          targetDir: "/tmp/test-skills",
        },
      );
      expect(result.ok).toBe(true);
      expect(mock.importSkill).toHaveBeenCalledWith(
        "@openviber-skills/web-search",
        "/tmp/test-skills",
      );
    });

    it("should strip source prefix from skill ID", async () => {
      const mock = createMockProvider("npm");
      manager.registerProvider(mock);

      const result = await manager.importSkill("npm:my-package", {
        targetDir: "/tmp/test-skills",
      });
      expect(result.ok).toBe(true);
      expect(mock.importSkill).toHaveBeenCalledWith(
        "my-package",
        "/tmp/test-skills",
      );
    });

    it("should return error for unknown source", async () => {
      const result = await manager.importSkill("something", {
        source: "unknown" as any,
        targetDir: "/tmp/test-skills",
      });
      expect(result.ok).toBe(false);
    });
  });
});
