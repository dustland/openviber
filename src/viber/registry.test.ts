import { describe, it, expect, vi } from "vitest";
import { providerRegistry, getModelProvider } from "./provider";

describe("ProviderRegistry", () => {
  it("should have default providers registered", () => {
    expect(providerRegistry.has("anthropic")).toBe(true);
    expect(providerRegistry.has("openai")).toBe(true);
    expect(providerRegistry.has("deepseek")).toBe(true);
    expect(providerRegistry.has("openrouter")).toBe(true);
  });

  it("should allow registering a custom provider", () => {
    const customProviderName = "custom-test";
    const mockFactory = vi.fn().mockReturnValue(() => ({}));

    providerRegistry.register(customProviderName, mockFactory);

    expect(providerRegistry.has(customProviderName)).toBe(true);

    // Test retrieval
    const config = { provider: customProviderName, modelName: "test-model" };
    const provider = getModelProvider(config);

    expect(mockFactory).toHaveBeenCalledWith(config);
    expect(provider).toBeDefined();
  });

  it("should throw error for unknown provider", () => {
    const config = { provider: "unknown-provider", modelName: "test-model" };
    expect(() => getModelProvider(config)).toThrow(/is not configured/);
  });
});
