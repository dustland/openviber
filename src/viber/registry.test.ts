import { describe, it, expect, vi } from "vitest";
import { ProviderRegistry } from "./registry";
import "./provider"; // Import to trigger side-effect registration
import { ModelConfig } from "./model-types";

describe("ProviderRegistry", () => {
  it("should allow registering a new provider", () => {
    const mockFactory = vi.fn().mockReturnValue("mock-provider-instance");
    ProviderRegistry.register("mock", mockFactory);

    expect(ProviderRegistry.has("mock")).toBe(true);

    const config: ModelConfig = { provider: "mock", modelName: "mock-model" };
    const instance = ProviderRegistry.get("mock", config);

    expect(instance).toBe("mock-provider-instance");
    expect(mockFactory).toHaveBeenCalledWith(config);
  });

  it("should throw error for unknown provider", () => {
    const config: ModelConfig = { provider: "unknown", modelName: "test" };
    expect(() => ProviderRegistry.get("unknown", config)).toThrow("Provider 'unknown' is not registered");
  });

  it("should have default providers registered", () => {
    expect(ProviderRegistry.has("openai")).toBe(true);
    expect(ProviderRegistry.has("anthropic")).toBe(true);
    expect(ProviderRegistry.has("deepseek")).toBe(true);
    expect(ProviderRegistry.has("openrouter")).toBe(true);
  });
});
