import { describe, it, expect, vi, beforeEach } from "vitest";
import { compressMessages, calculateContextBudget } from "./context";
import { summarizeConversation } from "./llm";
import type { ModelMessage, LanguageModel } from "ai";

vi.mock("./llm", () => ({
  summarizeConversation: vi.fn(),
}));

describe("compressMessages", () => {
  const mockModel = {} as LanguageModel;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return messages as-is if within budget", async () => {
    // 1000 tokens budget, very short message (3 tokens)
    const budget = calculateContextBudget(10000, "");
    const messages: ModelMessage[] = [{ role: "user", content: "Short message" }];

    const result = await compressMessages(messages, budget, mockModel);

    expect(result).toEqual(messages);
    expect(summarizeConversation).not.toHaveBeenCalled();
  });

  it("should attempt summarization if over budget and model provided", async () => {
    // Create a long conversation
    // Each message is roughly 10 tokens ("Message N " * 2)
    const messages: ModelMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i} `.repeat(10),
    }));

    // Budget: 100 tokens total. System prompt ~0. Overhead 500.
    // Wait, calculateContextBudget subtracts overhead (500) and completionTokens (4000) from totalLimit.
    // If totalLimit is small, availableForMessages might be negative.
    // Let's manually create a budget object to be sure.
    const budget = {
      totalLimit: 1000,
      systemPrompt: 0,
      tools: 0,
      completion: 0,
      overhead: 0,
      availableForMessages: 400, // Force compression, but allow summarized version to fit
    };

    (summarizeConversation as any).mockResolvedValue("Summary of old messages");

    const result = await compressMessages(messages, budget, mockModel);

    expect(summarizeConversation).toHaveBeenCalled();
    // result should be: [System(Summary), ...last 8 messages]
    expect(result.length).toBe(9);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("Summary of old messages");
  });

  it("should fallback to truncation if summarization fails or returns null", async () => {
    const messages: ModelMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i} `.repeat(5),
    }));

    const budget = {
      totalLimit: 1000,
      systemPrompt: 0,
      tools: 0,
      completion: 0,
      overhead: 0,
      availableForMessages: 50,
    };

    (summarizeConversation as any).mockResolvedValue(null);

    const result = await compressMessages(messages, budget, mockModel);

    // Should have truncated messages until it fits or only 1 left
    expect(result.length).toBeLessThan(messages.length);
    // Should NOT have the summary message
    expect(result[0].content).not.toContain("Summary of old messages");
  });

  it("should not attempt summarization if model is not provided", async () => {
    const messages: ModelMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i} `.repeat(5),
    }));

    const budget = {
      totalLimit: 1000,
      systemPrompt: 0,
      tools: 0,
      completion: 0,
      overhead: 0,
      availableForMessages: 50,
    };

    const result = await compressMessages(messages, budget); // No model

    expect(summarizeConversation).not.toHaveBeenCalled();
    expect(result.length).toBeLessThan(messages.length);
  });
});
