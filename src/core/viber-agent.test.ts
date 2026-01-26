/**
 * ViberAgent Integration Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock imports to avoid actual LLM calls
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Mocked response",
    output: { tasks: [] },
  }),
  streamText: vi.fn().mockResolvedValue({
    text: Promise.resolve("Mocked stream response"),
    fullStream: (async function* () {
      yield { type: "text-delta", textDelta: "Hello" };
      yield { type: "finish" };
    })(),
  }),
  Output: {
    object: vi.fn(),
  },
}));

describe("ViberAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ViberAgent.start", () => {
    it("should create a new ViberAgent with space", async () => {
      // Import after mocks are set up
      const { ViberAgent } = await import("./viber-agent");

      const agent = await ViberAgent.start("Test goal", {
        model: "deepseek-chat",
      });

      expect(agent).toBeDefined();
      expect(agent.spaceId).toBeDefined();
      expect(agent.getSpace()).toBeDefined();
    });
  });

  describe("ViberAgent.streamText", () => {
    it("should require agent mode", async () => {
      const { ViberAgent } = await import("./viber-agent");

      const agent = await ViberAgent.start("Test goal", {
        model: "deepseek-chat",
      });

      await expect(
        agent.streamText({
          messages: [{ role: "user", content: "Hello" }],
          metadata: { mode: "invalid" },
        })
      ).rejects.toThrow("ViberAgent only supports 'agent' mode");
    });
  });

  describe("ViberAgent methods", () => {
    it("should have getSpace method", async () => {
      const { ViberAgent } = await import("./viber-agent");

      const agent = await ViberAgent.start("Test goal");
      const space = agent.getSpace();

      expect(space).toBeDefined();
      expect(space.spaceId).toBe(agent.spaceId);
    });

    it("should have stop method", async () => {
      const { ViberAgent } = await import("./viber-agent");

      const agent = await ViberAgent.start("Test goal");

      // Should not throw
      expect(() => agent.stop()).not.toThrow();
    });

    it("should have addMessage method", async () => {
      const { ViberAgent } = await import("./viber-agent");

      const agent = await ViberAgent.start("Test goal");

      // Should not throw
      expect(() => agent.addMessage("Test message")).not.toThrow();
    });

    it("should have getSummary method", async () => {
      const { ViberAgent } = await import("./viber-agent");

      const agent = await ViberAgent.start("Test goal");
      const summary = agent.getSummary();

      expect(summary).toBeDefined();
      expect(summary.spaceId).toBeDefined();
    });
  });
});
