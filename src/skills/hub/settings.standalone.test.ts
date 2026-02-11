import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

vi.mock("../../config", () => ({
  getViberRoot: () => "/tmp/openviber-standalone-settings",
}));

describe("standalone skill settings", () => {
  const testDir = "/tmp/openviber-standalone-settings";
  const settingsPath = path.join(testDir, "settings.yaml");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.unlink(settingsPath).catch(() => {});
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it("loads standaloneSkills as normalized string ids", async () => {
    await fs.writeFile(
      settingsPath,
      [
        "standaloneSkills:",
        "  - codex-cli",
        "  - '  cursor-agent  '",
        "  - ''",
        "  - 123",
      ].join("\n"),
      "utf8",
    );

    const { loadSettings } = await import("./settings");
    const settings = await loadSettings();

    expect(settings.standaloneSkills).toEqual(["codex-cli", "cursor-agent"]);
  });

  it("loads oauthTokens for standalone skills", async () => {
    await fs.writeFile(
      settingsPath,
      [
        "oauthTokens:",
        "  google:",
        "    accessToken: 'google_access_token'",
        "    refreshToken: 'google_refresh_token'",
        "  invalid:",
        "    accessToken: ''",
      ].join("\n"),
      "utf8",
    );

    const { loadSettings } = await import("./settings");
    const settings = await loadSettings();

    expect(settings.oauthTokens?.google?.accessToken).toBe("google_access_token");
    expect(settings.oauthTokens?.google?.refreshToken).toBe("google_refresh_token");
    expect(settings.oauthTokens?.invalid).toBeUndefined();
  });
});
