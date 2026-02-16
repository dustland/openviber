/**
 * Tests for CLI auth module
 *
 * Covers: headless detection, URL parsing, Google OAuth URL building,
 * API key .env persistence, local callback server, token storage,
 * action type categorization, skill picker display, and LLM key detection.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as http from "http";

// Mock config module so settings use a temp directory
vi.mock("../core/config-runtime", () => ({
  getViberRoot: () => "/tmp/openviber-test-auth",
}));

describe("CLI Auth Module", () => {
  const testDir = "/tmp/openviber-test-auth";
  const envFile = path.join(testDir, ".env");
  const settingsFile = path.join(testDir, "settings.yaml");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.unlink(envFile).catch(() => { });
    await fs.unlink(settingsFile).catch(() => { });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
    // Restore all env var changes
    vi.unstubAllEnvs();
  });

  // ──────────────────────────────────────────────────────────
  // Headless detection
  // ──────────────────────────────────────────────────────────

  describe("isHeadless()", () => {
    it("returns true when SSH_CONNECTION is set", async () => {
      const original = process.env.SSH_CONNECTION;
      process.env.SSH_CONNECTION = "10.0.0.1 12345 10.0.0.2 22";
      const { isHeadless } = await import("./auth");
      expect(isHeadless()).toBe(true);
      if (original === undefined) {
        delete process.env.SSH_CONNECTION;
      } else {
        process.env.SSH_CONNECTION = original;
      }
    });

    it("returns true when SSH_TTY is set", async () => {
      const original = process.env.SSH_TTY;
      process.env.SSH_TTY = "/dev/pts/0";
      const { isHeadless } = await import("./auth");
      expect(isHeadless()).toBe(true);
      if (original === undefined) {
        delete process.env.SSH_TTY;
      } else {
        process.env.SSH_TTY = original;
      }
    });

    it("returns false on macOS without SSH", async () => {
      const origConn = process.env.SSH_CONNECTION;
      const origTty = process.env.SSH_TTY;
      delete process.env.SSH_CONNECTION;
      delete process.env.SSH_TTY;

      const { isHeadless } = await import("./auth");
      // On macOS (darwin), it should not be headless without SSH
      if (process.platform === "darwin") {
        expect(isHeadless()).toBe(false);
      }

      // Restore
      if (origConn !== undefined) process.env.SSH_CONNECTION = origConn;
      if (origTty !== undefined) process.env.SSH_TTY = origTty;
    });
  });

  // ──────────────────────────────────────────────────────────
  // URL parsing (extractCodeFromUrl)
  // ──────────────────────────────────────────────────────────

  describe("extractCodeFromUrl()", () => {
    it("extracts code from a full redirect URL", async () => {
      const { extractCodeFromUrl } = await import("./auth");
      const url =
        "http://localhost:9876/callback?code=4/0AX4XfWh_abc123&state=xyz";
      expect(extractCodeFromUrl(url)).toBe("4/0AX4XfWh_abc123");
    });

    it("extracts code from https URL", async () => {
      const { extractCodeFromUrl } = await import("./auth");
      const url = "https://localhost:9876/callback?code=my-auth-code&state=s1";
      expect(extractCodeFromUrl(url)).toBe("my-auth-code");
    });

    it("returns null for URL without code param", async () => {
      const { extractCodeFromUrl } = await import("./auth");
      const url = "http://localhost:9876/callback?error=access_denied";
      expect(extractCodeFromUrl(url)).toBeNull();
    });

    it("returns the raw string if input is not a URL", async () => {
      const { extractCodeFromUrl } = await import("./auth");
      expect(extractCodeFromUrl("4/0AX4XfWh_abc123")).toBe(
        "4/0AX4XfWh_abc123",
      );
    });

    it("returns null for empty input", async () => {
      const { extractCodeFromUrl } = await import("./auth");
      expect(extractCodeFromUrl("")).toBeNull();
      expect(extractCodeFromUrl("   ")).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────
  // Google OAuth URL builder
  // ──────────────────────────────────────────────────────────

  describe("buildGoogleAuthUrl()", () => {
    it("builds a valid Google consent URL", async () => {
      const { buildGoogleAuthUrl, GOOGLE_OAUTH_SCOPES, LOCAL_REDIRECT_URI } =
        await import("./auth");
      const url = buildGoogleAuthUrl("test-client-id", "test-state");
      const parsed = new URL(url);

      expect(parsed.hostname).toBe("accounts.google.com");
      expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsed.searchParams.get("redirect_uri")).toBe(LOCAL_REDIRECT_URI);
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("access_type")).toBe("offline");
      expect(parsed.searchParams.get("prompt")).toBe("consent");
      expect(parsed.searchParams.get("state")).toBe("test-state");
      expect(parsed.searchParams.get("scope")).toBe(
        GOOGLE_OAUTH_SCOPES.join(" "),
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // Google credential resolution
  // ──────────────────────────────────────────────────────────

  describe("resolveGoogleCredentials()", () => {
    it("returns null when env vars are not set", async () => {
      const origId = process.env.GOOGLE_CLIENT_ID;
      const origSecret = process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const { resolveGoogleCredentials } = await import("./auth");
      expect(resolveGoogleCredentials()).toBeNull();

      if (origId !== undefined) process.env.GOOGLE_CLIENT_ID = origId;
      if (origSecret !== undefined)
        process.env.GOOGLE_CLIENT_SECRET = origSecret;
    });

    it("returns credentials when both env vars are set", async () => {
      const origId = process.env.GOOGLE_CLIENT_ID;
      const origSecret = process.env.GOOGLE_CLIENT_SECRET;
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const { resolveGoogleCredentials } = await import("./auth");
      const result = resolveGoogleCredentials();
      expect(result).toEqual({
        clientId: "test-id",
        clientSecret: "test-secret",
      });

      if (origId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = origId;
      }
      if (origSecret === undefined) {
        delete process.env.GOOGLE_CLIENT_SECRET;
      } else {
        process.env.GOOGLE_CLIENT_SECRET = origSecret;
      }
    });
  });

  // ──────────────────────────────────────────────────────────
  // API key .env persistence
  // ──────────────────────────────────────────────────────────

  describe("saveApiKeyToEnv()", () => {
    it("creates .env file with the key", async () => {
      const { saveApiKeyToEnv } = await import("./auth");
      await saveApiKeyToEnv("OPENROUTER_API_KEY", "sk-test-123");

      const content = await fs.readFile(envFile, "utf8");
      expect(content).toContain("OPENROUTER_API_KEY=sk-test-123");
    });

    it("updates an existing key in .env", async () => {
      await fs.writeFile(
        envFile,
        "OPENROUTER_API_KEY=old-value\nANTHROPIC_API_KEY=keep-me\n",
      );

      const { saveApiKeyToEnv } = await import("./auth");
      await saveApiKeyToEnv("OPENROUTER_API_KEY", "new-value");

      const content = await fs.readFile(envFile, "utf8");
      expect(content).toContain("OPENROUTER_API_KEY=new-value");
      expect(content).toContain("ANTHROPIC_API_KEY=keep-me");
      expect(content).not.toContain("old-value");
    });

    it("appends a new key without clobbering existing ones", async () => {
      await fs.writeFile(envFile, "ANTHROPIC_API_KEY=ant-key\n");

      const { saveApiKeyToEnv } = await import("./auth");
      await saveApiKeyToEnv("OPENAI_API_KEY", "oai-key");

      const content = await fs.readFile(envFile, "utf8");
      expect(content).toContain("ANTHROPIC_API_KEY=ant-key");
      expect(content).toContain("OPENAI_API_KEY=oai-key");
    });
  });

  // ──────────────────────────────────────────────────────────
  // .env autoloader
  // ──────────────────────────────────────────────────────────

  describe("loadOpenViberEnv()", () => {
    it("loads variables from .env file", async () => {
      await fs.writeFile(envFile, "TEST_CLI_AUTH_VAR=hello-world\n");
      delete process.env.TEST_CLI_AUTH_VAR;

      const { loadOpenViberEnv } = await import("./auth");
      await loadOpenViberEnv();

      expect(process.env.TEST_CLI_AUTH_VAR).toBe("hello-world");
      delete process.env.TEST_CLI_AUTH_VAR;
    });

    it("does not override existing env vars", async () => {
      process.env.TEST_CLI_AUTH_EXISTING = "original";
      await fs.writeFile(envFile, "TEST_CLI_AUTH_EXISTING=overwritten\n");

      const { loadOpenViberEnv } = await import("./auth");
      await loadOpenViberEnv();

      expect(process.env.TEST_CLI_AUTH_EXISTING).toBe("original");
      delete process.env.TEST_CLI_AUTH_EXISTING;
    });

    it("skips comments and blank lines", async () => {
      await fs.writeFile(
        envFile,
        "# This is a comment\n\nTEST_CLI_AUTH_VAR2=value2\n",
      );
      delete process.env.TEST_CLI_AUTH_VAR2;

      const { loadOpenViberEnv } = await import("./auth");
      await loadOpenViberEnv();

      expect(process.env.TEST_CLI_AUTH_VAR2).toBe("value2");
      delete process.env.TEST_CLI_AUTH_VAR2;
    });

    it("handles missing .env file gracefully", async () => {
      const { loadOpenViberEnv } = await import("./auth");
      // Should not throw
      await expect(loadOpenViberEnv()).resolves.toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  // Local callback server
  // ──────────────────────────────────────────────────────────

  describe("startCallbackServer()", () => {
    it("resolves with code when callback receives valid request", async () => {
      const {
        startCallbackServer,
        LOCAL_CALLBACK_PORT,
        LOCAL_CALLBACK_PATH,
      } = await import("./auth");

      const state = "test-state-123";
      const serverPromise = startCallbackServer(state);

      // Give the server a moment to start
      await new Promise((r) => setTimeout(r, 200));

      // Simulate the OAuth callback
      const callbackUrl = `http://127.0.0.1:${LOCAL_CALLBACK_PORT}${LOCAL_CALLBACK_PATH}?code=test-auth-code&state=${state}`;
      const res = await fetch(callbackUrl);
      expect(res.ok).toBe(true);

      const { code, server } = await serverPromise;
      expect(code).toBe("test-auth-code");
      server.close();
    });

    it("rejects when callback contains error param", async () => {
      const {
        startCallbackServer,
        LOCAL_CALLBACK_PORT,
        LOCAL_CALLBACK_PATH,
      } = await import("./auth");

      const state = "test-state-err";
      const serverPromise = startCallbackServer(state);

      // Attach the rejection handler immediately to avoid unhandled rejection
      const rejectPromise = serverPromise.catch((err) => err);

      await new Promise((r) => setTimeout(r, 200));

      const callbackUrl = `http://127.0.0.1:${LOCAL_CALLBACK_PORT}${LOCAL_CALLBACK_PATH}?error=access_denied`;
      await fetch(callbackUrl);

      const err = await rejectPromise;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain("access_denied");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Constants
  // ──────────────────────────────────────────────────────────

  describe("constants", () => {
    it("exports expected provider env keys", async () => {
      const { PROVIDER_ENV_KEYS } = await import("./auth");
      expect(PROVIDER_ENV_KEYS.openrouter.envVar).toBe("OPENROUTER_API_KEY");
      expect(PROVIDER_ENV_KEYS.anthropic.envVar).toBe("ANTHROPIC_API_KEY");
      expect(PROVIDER_ENV_KEYS.openai.envVar).toBe("OPENAI_API_KEY");
      expect(PROVIDER_ENV_KEYS.deepseek.envVar).toBe("DEEPSEEK_API_KEY");
    });

    it("has correct local redirect URI", async () => {
      const { LOCAL_REDIRECT_URI, LOCAL_CALLBACK_PORT, LOCAL_CALLBACK_PATH } =
        await import("./auth");
      expect(LOCAL_REDIRECT_URI).toBe(
        `http://localhost:${LOCAL_CALLBACK_PORT}${LOCAL_CALLBACK_PATH}`,
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // LLM key detection
  // ──────────────────────────────────────────────────────────

  describe("hasAnyLlmKey()", () => {
    it("returns false when no provider keys are set", async () => {
      const origKeys = {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      };
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;

      const { hasAnyLlmKey } = await import("./auth");
      expect(hasAnyLlmKey()).toBe(false);

      // Restore
      for (const [k, v] of Object.entries(origKeys)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it("returns true when any provider key is set", async () => {
      const origKey = process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_API_KEY = "sk-test";

      const { hasAnyLlmKey } = await import("./auth");
      expect(hasAnyLlmKey()).toBe(true);

      if (origKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = origKey;
    });
  });

  // ──────────────────────────────────────────────────────────
  // Skill picker display
  // ──────────────────────────────────────────────────────────

  describe("getSkillStatusLabel()", () => {
    it("returns READY for available skills", async () => {
      const { getSkillStatusLabel } = await import("./auth");
      const result = getSkillStatusLabel({
        id: "github",
        name: "github",
        status: "AVAILABLE",
        available: true,
        checks: [{ id: "gh-cli", label: "GitHub CLI", ok: true }],
        summary: "All prerequisites satisfied.",
      });
      expect(result.label).toBe("READY");
      expect(result.detail).toBe("");
    });

    it("returns NEEDS SETUP for skills needing OAuth", async () => {
      const { getSkillStatusLabel } = await import("./auth");
      const result = getSkillStatusLabel({
        id: "gmail",
        name: "gmail",
        status: "NOT_AVAILABLE",
        available: false,
        checks: [
          {
            id: "google-oauth",
            label: "Google OAuth",
            ok: false,
            actionType: "oauth",
          },
        ],
        summary: "Missing: Google OAuth",
      });
      expect(result.label).toBe("NEEDS SETUP");
      expect(result.detail).toBe("Google OAuth");
    });

    it("returns MISSING for skills missing a binary", async () => {
      const { getSkillStatusLabel } = await import("./auth");
      const result = getSkillStatusLabel({
        id: "codex-cli",
        name: "codex-cli",
        status: "NOT_AVAILABLE",
        available: false,
        checks: [
          {
            id: "codex-cli",
            label: "Codex CLI installed",
            ok: false,
            actionType: "binary",
          },
          {
            id: "codex-auth",
            label: "Codex auth",
            ok: false,
            actionType: "auth_cli",
          },
        ],
        summary: "Missing: Codex CLI installed, Codex auth",
      });
      expect(result.label).toBe("MISSING");
      expect(result.detail).toBe("Codex CLI installed");
    });

    it("returns UNKNOWN for unknown status", async () => {
      const { getSkillStatusLabel } = await import("./auth");
      const result = getSkillStatusLabel({
        id: "custom",
        name: "custom",
        status: "UNKNOWN",
        available: false,
        checks: [],
        summary: "No automated health checks defined.",
      });
      expect(result.label).toBe("UNKNOWN");
    });
  });
});

// ──────────────────────────────────────────────────────────
// Health check action types
// ──────────────────────────────────────────────────────────

describe("HealthCheckActionType annotations", () => {
  // Run the full health report once and share across all assertions
  // (health checks involve spawnSync + HTTP calls that are slow)
  let report: import("../skills/health").SkillHealthReport;

  beforeAll(async () => {
    const { getSkillHealthReport } = await import("../skills/health");
    report = await getSkillHealthReport();
  }, 30_000);

  it("binary checks have actionType binary", () => {
    const terminal = report.skills.find((s) => s.id === "terminal");
    expect(terminal).toBeDefined();
    const cmdCheck = terminal!.checks.find((c) => c.id === "tmux");
    expect(cmdCheck?.actionType).toBe("binary");
  });

  it("gmail has actionType oauth", () => {
    const gmail = report.skills.find((s) => s.id === "gmail");
    expect(gmail).toBeDefined();
    const oauthCheck = gmail!.checks.find((c) => c.id === "google-oauth");
    expect(oauthCheck?.actionType).toBe("oauth");
  });

  it("github has binary and auth_cli actionTypes", () => {
    const github = report.skills.find((s) => s.id === "github");
    expect(github).toBeDefined();
    const cliCheck = github!.checks.find((c) => c.id === "gh-cli");
    expect(cliCheck?.actionType).toBe("binary");
    const authCheck = github!.checks.find((c) => c.id === "gh-auth");
    expect(authCheck?.actionType).toBe("auth_cli");
  });

});
