/**
 * Tests for new skill hub providers:
 * - HuggingFaceProvider
 * - SmitheryProvider
 * - ComposioProvider
 * - GlamaProvider
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HuggingFaceProvider } from "./huggingface";
import { SmitheryProvider } from "./smithery";
import { ComposioProvider } from "./composio";
import { GlamaProvider } from "./glama";

describe("HuggingFaceProvider", () => {
  let provider: HuggingFaceProvider;

  beforeEach(() => {
    provider = new HuggingFaceProvider();
  });

  it("should have correct type and display name", () => {
    expect(provider.type).toBe("huggingface");
    expect(provider.displayName).toBe("Hugging Face");
  });

  it("should search HF API with openviber-skill filter", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            modelId: "user/my-skill",
            description: "A great skill",
            author: "user",
            tags: ["openviber-skill"],
            likes: 42,
            lastModified: "2025-06-01T00:00:00Z",
          },
        ]),
        { status: 200 },
      ),
    );

    const result = await provider.search({ query: "web" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("models");
    expect(url).toContain("openviber-skill");

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].source).toBe("huggingface");
    expect(result.skills[0].popularity).toBe(42);

    fetchSpy.mockRestore();
  });

  it("should handle API errors gracefully", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await provider.search({ query: "test" });
    expect(result.skills).toHaveLength(0);

    fetchSpy.mockRestore();
  });
});

describe("SmitheryProvider", () => {
  let provider: SmitheryProvider;

  beforeEach(() => {
    provider = new SmitheryProvider();
  });

  it("should have correct type and display name", () => {
    expect(provider.type).toBe("smithery");
    expect(provider.displayName).toBe("Smithery (MCP)");
  });

  it("should search smithery registry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          servers: [
            {
              qualifiedName: "@anthropic/mcp-server-filesystem",
              displayName: "Filesystem MCP",
              description: "File system operations",
              vendor: "Anthropic",
              tags: ["filesystem", "mcp"],
              useCount: 5000,
            },
          ],
          totalCount: 1,
        }),
        { status: 200 },
      ),
    );

    const result = await provider.search({ query: "filesystem" });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].source).toBe("smithery");
    expect(result.skills[0].name).toBe("Filesystem MCP");
    expect(result.skills[0].popularity).toBe(5000);

    fetchSpy.mockRestore();
  });

  it("should return error when server not found on import", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const result = await provider.importSkill("nonexistent", "/tmp/test");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not found");

    fetchSpy.mockRestore();
  });
});

describe("ComposioProvider", () => {
  let provider: ComposioProvider;

  beforeEach(() => {
    provider = new ComposioProvider();
  });

  it("should have correct type and display name", () => {
    expect(provider.type).toBe("composio");
    expect(provider.displayName).toBe("Composio");
  });

  it("should search composio apps", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              key: "github",
              name: "GitHub",
              description: "GitHub integration",
              categories: ["developer-tools"],
              activeConnections: 1200,
            },
            {
              key: "slack",
              name: "Slack",
              description: "Slack messaging",
              categories: ["communication"],
              activeConnections: 800,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await provider.search({});
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].source).toBe("composio");
    expect(result.skills[0].author).toBe("Composio");

    fetchSpy.mockRestore();
  });

  it("should return error for non-existent app on import", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const result = await provider.importSkill("nonexistent", "/tmp/test");
    expect(result.ok).toBe(false);

    fetchSpy.mockRestore();
  });
});

describe("GlamaProvider", () => {
  let provider: GlamaProvider;

  beforeEach(() => {
    provider = new GlamaProvider();
  });

  it("should have correct type and display name", () => {
    expect(provider.type).toBe("glama");
    expect(provider.displayName).toBe("Glama (MCP)");
  });

  it("should search glama directory", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          servers: [
            {
              id: "browser-tools",
              name: "Browser Tools",
              description: "Browser automation MCP server",
              author: "glama",
              tags: ["browser", "automation"],
              stars: 250,
              repository: "https://github.com/example/browser-tools",
            },
          ],
          total: 1,
        }),
        { status: 200 },
      ),
    );

    const result = await provider.search({ query: "browser" });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].source).toBe("glama");
    expect(result.skills[0].name).toBe("Browser Tools");
    expect(result.skills[0].popularity).toBe(250);

    fetchSpy.mockRestore();
  });

  it("should return null for non-existent server info", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const info = await provider.getSkillInfo("nonexistent");
    expect(info).toBeNull();

    fetchSpy.mockRestore();
  });

  it("should return error when server not found on import", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const result = await provider.importSkill("nonexistent", "/tmp/test");
    expect(result.ok).toBe(false);

    fetchSpy.mockRestore();
  });
});
