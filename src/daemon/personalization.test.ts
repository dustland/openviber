/**
 * Tests for loadPersonalization — the four-file pattern
 * (SOUL.md, USER.md, MEMORY.md, IDENTITY.md) with backwards compatibility.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";

// vi.mock factories are hoisted, so we use vi.hoisted to create mocks
// that can be referenced both in the factory and in tests.
const { readFileMock, accessMock, readdirMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  accessMock: vi.fn(),
  readdirMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: readFileMock,
  access: accessMock,
  readdir: readdirMock,
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
}));

vi.mock("../viber/config", () => ({
  getViberRoot: () => "/mock/.openviber",
  getViberPath: (...segments: string[]) =>
    ["/mock/.openviber", ...segments].join("/"),
}));

vi.mock("../utils/module-path", () => ({
  getModuleDirname: () => "/mock/dist/daemon",
}));

vi.mock("../skills/hub/settings", () => ({
  loadSettings: vi.fn().mockResolvedValue({}),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up
import { loadPersonalization } from "./runtime";

describe("loadPersonalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default: all file reads fail (file not found), access fails, readdir returns empty
    readFileMock.mockRejectedValue({ code: "ENOENT" });
    accessMock.mockRejectedValue({ code: "ENOENT" });
    readdirMock.mockResolvedValue([]);
  });

  function mockFileRead(pathToContent: Record<string, string>) {
    readFileMock.mockImplementation(async (filePath: string) => {
      if (pathToContent[filePath]) {
        return pathToContent[filePath];
      }
      throw { code: "ENOENT" };
    });
  }

  it("should load UPPERCASE files from vibers/ path", async () => {
    mockFileRead({
      "/mock/.openviber/vibers/default/SOUL.md": "I am a helpful assistant",
      "/mock/.openviber/USER.md": "User context here",
      "/mock/.openviber/vibers/default/MEMORY.md": "Previous decisions",
      "/mock/.openviber/IDENTITY.md": "This is a dev machine",
    });

    const result = await loadPersonalization("default");

    expect(result).toContain("<identity>");
    expect(result).toContain("This is a dev machine");
    expect(result).toContain("<soul>");
    expect(result).toContain("I am a helpful assistant");
    expect(result).toContain("<user>");
    expect(result).toContain("User context here");
    expect(result).toContain("<memory>");
    expect(result).toContain("Previous decisions");
  });

  it("should fall back to lowercase filenames for backwards compat", async () => {
    mockFileRead({
      "/mock/.openviber/vibers/default/soul.md": "Lowercase soul",
      "/mock/.openviber/user.md": "Lowercase user",
      "/mock/.openviber/vibers/default/memory.md": "Lowercase memory",
    });

    const result = await loadPersonalization("default");

    expect(result).toContain("<soul>");
    expect(result).toContain("Lowercase soul");
    expect(result).toContain("<user>");
    expect(result).toContain("Lowercase user");
    expect(result).toContain("<memory>");
    expect(result).toContain("Lowercase memory");
  });

  it("should prefer uppercase over lowercase", async () => {
    mockFileRead({
      "/mock/.openviber/vibers/default/SOUL.md": "Uppercase soul wins",
      "/mock/.openviber/vibers/default/soul.md": "Lowercase soul loses",
    });

    const result = await loadPersonalization("default");

    expect(result).toContain("Uppercase soul wins");
    expect(result).not.toContain("Lowercase soul loses");
  });

  it("should fall back to legacy tasks/ path", async () => {
    mockFileRead({
      "/mock/.openviber/tasks/myviber/SOUL.md": "Legacy soul from tasks",
      "/mock/.openviber/USER.md": "User file",
    });

    const result = await loadPersonalization("myviber");

    expect(result).toContain("Legacy soul from tasks");
    expect(result).toContain("User file");
  });

  it("should prefer vibers/ over tasks/ (legacy)", async () => {
    mockFileRead({
      "/mock/.openviber/vibers/myviber/SOUL.md": "Primary vibers soul",
      "/mock/.openviber/tasks/myviber/SOUL.md": "Legacy tasks soul",
    });

    const result = await loadPersonalization("myviber");

    expect(result).toContain("Primary vibers soul");
    expect(result).not.toContain("Legacy tasks soul");
  });

  it("should return empty string when no files exist", async () => {
    const result = await loadPersonalization("nonexistent");
    expect(result).toBe("");
  });

  it("should support per-viber IDENTITY.md override", async () => {
    mockFileRead({
      "/mock/.openviber/vibers/specialized/IDENTITY.md":
        "Specialized identity",
      "/mock/.openviber/IDENTITY.md": "Root identity",
    });

    const result = await loadPersonalization("specialized");

    expect(result).toContain("Specialized identity");
    expect(result).not.toContain("Root identity");
  });

  it("should inject sections in correct order: identity, soul, user, memory", async () => {
    mockFileRead({
      "/mock/.openviber/IDENTITY.md": "IDENT",
      "/mock/.openviber/vibers/default/SOUL.md": "SOUL",
      "/mock/.openviber/USER.md": "USER",
      "/mock/.openviber/vibers/default/MEMORY.md": "MEM",
    });

    const result = await loadPersonalization("default");

    const identityIdx = result.indexOf("<identity>");
    const soulIdx = result.indexOf("<soul>");
    const userIdx = result.indexOf("<user>");
    const memoryIdx = result.indexOf("<memory>");

    expect(identityIdx).toBeGreaterThanOrEqual(0);
    expect(soulIdx).toBeGreaterThan(identityIdx);
    expect(userIdx).toBeGreaterThan(soulIdx);
    expect(memoryIdx).toBeGreaterThan(userIdx);
  });
});
