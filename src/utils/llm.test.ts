import { describe, it, expect, vi } from "vitest";
import { summarizeConversation } from "./llm";
import { generateText, LanguageModel, ModelMessage } from "ai";

vi.mock("ai", async () => {
  const actual = await vi.importActual("ai");
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe("summarizeConversation", () => {
  const mockModel = {} as LanguageModel;

  it("should return null for empty messages", async () => {
    const result = await summarizeConversation([], mockModel);
    expect(result).toBeNull();
  });

  it("should call generateText with correct arguments and return summary", async () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];

    (generateText as any).mockResolvedValue({ text: "Summary of conversation" });

    const result = await summarizeConversation(messages, mockModel);

    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      messages: expect.arrayContaining([
        ...messages,
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Summarize"),
        }),
      ]),
    });
    expect(result).toBe("Summary of conversation");
  });

  it("should return null on error", async () => {
    const messages: ModelMessage[] = [{ role: "user", content: "Hello" }];
    (generateText as any).mockRejectedValue(new Error("LLM Error"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await summarizeConversation(messages, mockModel);

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
