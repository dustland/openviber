/**
 * Tests for config validator
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateLlmKey,
  validateOAuthToken,
  validateEnvSecrets,
  validateAllLlmKeys,
  validateAllOAuthTokens,
} from "./config-validator";

// Mock fetch globally
global.fetch = vi.fn();

describe("config-validator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateLlmKey", () => {
    it("should fail for empty API key", async () => {
      const result = await validateLlmKey("anthropic", "");
      expect(result.status).toBe("failed");
      expect(result.message).toContain("empty");
    });

    it("should return unchecked for unknown provider", async () => {
      const result = await validateLlmKey("unknown-provider", "test-key");
      expect(result.status).toBe("unchecked");
      expect(result.message).toContain("not implemented");
    });

    it("should validate OpenRouter key via models API", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await validateLlmKey("openrouter", "test-key");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/models",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        }),
      );
      expect(result.status).toBe("verified");
    });

    it("should fail OpenRouter validation on 401", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const result = await validateLlmKey("openrouter", "invalid-key");
      expect(result.status).toBe("failed");
      expect(result.message).toContain("401");
    });
  });

  describe("validateOAuthToken", () => {
    it("should fail for empty token", async () => {
      const result = await validateOAuthToken("google", "");
      expect(result.status).toBe("failed");
      expect(result.message).toContain("empty");
    });

    it("should fail for expired token", async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
      const result = await validateOAuthToken("google", "test-token", pastDate);
      expect(result.status).toBe("failed");
      expect(result.message).toContain("expired");
    });

    it("should validate Google OAuth token", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const result = await validateOAuthToken("google", "test-token", futureDate);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
      expect(result.status).toBe("verified");
    });

    it("should validate GitHub OAuth token", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await validateOAuthToken("github", "test-token");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/user",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
      expect(result.status).toBe("verified");
    });
  });

  describe("validateEnvSecrets", () => {
    it("should verify all secrets are present", () => {
      const result = validateEnvSecrets(
        ["KEY1", "KEY2"],
        { KEY1: "value1", KEY2: "value2" },
      );
      expect(result.status).toBe("verified");
      expect(result.message).toContain("present");
    });

    it("should fail for missing secrets", () => {
      const result = validateEnvSecrets(["KEY1", "KEY2"], { KEY1: "value1" });
      expect(result.status).toBe("failed");
      expect(result.message).toContain("Missing");
      expect(result.message).toContain("KEY2");
    });

    it("should fail for empty secrets", () => {
      const result = validateEnvSecrets(["KEY1", "KEY2"], {
        KEY1: "value1",
        KEY2: "",
      });
      expect(result.status).toBe("failed");
      expect(result.message).toContain("Empty");
      expect(result.message).toContain("KEY2");
    });
  });

  describe("validateAllLlmKeys", () => {
    it("should validate multiple providers", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const providers = {
        openrouter: { apiKey: "key1" },
        anthropic: { apiKey: "key2" },
      };

      const results = await validateAllLlmKeys(providers);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("validateAllOAuthTokens", () => {
    it("should validate multiple OAuth tokens", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const connections = [
        { provider: "google", accessToken: "token1", expiresAt: null },
        { provider: "github", accessToken: "token2", expiresAt: null },
      ];

      const results = await validateAllOAuthTokens(connections);
      expect(results.length).toBe(2);
    });
  });
});
