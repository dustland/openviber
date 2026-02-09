/**
 * Tests for skill hub settings persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Mock fs and config
vi.mock("../../config", () => ({
  getViberRoot: () => "/tmp/openviber-test-settings",
}));

describe("Settings Persistence", () => {
  const testDir = "/tmp/openviber-test-settings";
  const settingsPath = path.join(testDir, "settings.yaml");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    // Remove settings file if it exists
    await fs.unlink(settingsPath).catch(() => {});
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should return defaults when settings file does not exist", async () => {
    const { loadSettings } = await import("./settings");
    const settings = await loadSettings();
    expect(settings.skillSources).toBeDefined();
    expect(settings.skillSources!.github?.enabled).toBe(true);
    expect(settings.skillSources!.composio?.enabled).toBe(false);
  });

  it("should save and load settings", async () => {
    const { saveSettings, loadSettings } = await import("./settings");

    const customSettings = {
      skillSources: {
        github: { enabled: true, url: "https://custom-github.example.com" },
        npm: { enabled: false },
        huggingface: { enabled: true, apiKey: "hf_test_key" },
        smithery: { enabled: true },
        composio: { enabled: true, apiKey: "comp_test_key" },
        glama: { enabled: false },
        openclaw: { enabled: true },
      },
    };

    await saveSettings(customSettings);

    // Verify file was created
    const content = await fs.readFile(settingsPath, "utf8");
    expect(content).toContain("skillSources");
    expect(content).toContain("github");

    // Load it back
    const loaded = await loadSettings();
    expect(loaded.skillSources!.github?.enabled).toBe(true);
    expect(loaded.skillSources!.github?.url).toBe("https://custom-github.example.com");
    expect(loaded.skillSources!.npm?.enabled).toBe(false);
    expect(loaded.skillSources!.huggingface?.apiKey).toBe("hf_test_key");
    expect(loaded.skillSources!.composio?.enabled).toBe(true);
    expect(loaded.skillSources!.glama?.enabled).toBe(false);
  });

  it("should handle corrupt YAML gracefully", async () => {
    await fs.writeFile(settingsPath, "{{invalid yaml!!!}}}}}", "utf8");

    const { loadSettings } = await import("./settings");
    const settings = await loadSettings();
    // Should return defaults instead of crashing
    expect(settings.skillSources).toBeDefined();
  });

  it("should merge partial updates with defaults", async () => {
    // Write a settings file with only github configured
    await fs.writeFile(
      settingsPath,
      `skillSources:
  github:
    enabled: false
    url: "https://custom.example.com"
`,
      "utf8",
    );

    const { loadSettings } = await import("./settings");
    const settings = await loadSettings();

    // github should be disabled (from file)
    expect(settings.skillSources!.github?.enabled).toBe(false);
    expect(settings.skillSources!.github?.url).toBe("https://custom.example.com");

    // Others should have defaults
    expect(settings.skillSources!.npm?.enabled).toBe(true);
    expect(settings.skillSources!.smithery?.enabled).toBe(true);
  });

  it("should load skill sources config independently", async () => {
    const { loadSkillSourcesConfig, saveSkillSourcesConfig } = await import(
      "./settings"
    );

    // Save only sources config
    await saveSkillSourcesConfig({
      github: { enabled: false },
      npm: { enabled: true, url: "https://custom-npm.example.com" },
    });

    const config = await loadSkillSourcesConfig();
    expect(config.github?.enabled).toBe(false);
    expect(config.npm?.url).toBe("https://custom-npm.example.com");
  });
});
