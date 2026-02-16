/**
 * Tests for provider-model preflight validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { preflightValidate, formatPreflightError } from "./preflight";

describe("preflightValidate", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should fail when no API key is present for provider", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await preflightValidate("openai", "gpt-4o");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("No API key");
    expect(result.errors[0]).toContain("OPENAI_API_KEY");
  });

  it("should pass when API key is provided explicitly", async () => {
    const result = await preflightValidate("openai", "gpt-4o", "sk-test-key", {
      skipModelCheck: true,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should pass when API key is in env", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = await preflightValidate("anthropic", "claude-3.5-sonnet", undefined, {
      skipModelCheck: true,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail for empty model name", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const result = await preflightValidate("openai", "", undefined, {
      skipModelCheck: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Model name is empty");
  });

  it("should handle unknown provider gracefully", async () => {
    const result = await preflightValidate("unknown-provider", "some-model", "test-key", {
      skipModelCheck: true,
    });
    // Should pass basic validation since a key was provided
    expect(result.ok).toBe(true);
  });

  it("should retry silently on model check timeout", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    // Mock fetch to timeout
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    );

    const result = await preflightValidate("openai", "gpt-4o");
    expect(result.ok).toBe(true); // Should not fail on timeout
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("timed out");

    global.fetch = originalFetch;
  });

  it("should fail on 401 from models endpoint", async () => {
    process.env.OPENAI_API_KEY = "invalid-key";

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const result = await preflightValidate("openai", "gpt-4o");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("invalid or expired");

    global.fetch = originalFetch;
  });

  it("should warn when model not found in list", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }],
      }),
    });

    const result = await preflightValidate("openai", "gpt-999-turbo");
    expect(result.ok).toBe(true); // Warning, not error
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("not found");

    global.fetch = originalFetch;
  });

  it("should pass when model is found in list", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }],
      }),
    });

    const result = await preflightValidate("openai", "gpt-4o");
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);

    global.fetch = originalFetch;
  });
});

describe("formatPreflightError", () => {
  it("should format errors and warnings clearly", () => {
    const message = formatPreflightError({
      ok: false,
      provider: "openai",
      model: "gpt-4o",
      errors: ["No API key found"],
      warnings: ["Provider may not be configured"],
    });
    expect(message).toContain("openai/gpt-4o");
    expect(message).toContain("✗ No API key found");
    expect(message).toContain("⚡ Provider may not be configured");
  });
});
