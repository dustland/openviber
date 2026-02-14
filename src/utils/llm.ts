import { generateText, type LanguageModel, type ModelMessage } from "ai";

/**
 * Summarize a conversation using an LLM.
 *
 * @param messages The conversation history to summarize.
 * @param model The language model to use for summarization.
 * @returns A promise resolving to the summary string, or null if summarization fails.
 */
export async function summarizeConversation(
  messages: ModelMessage[],
  model: LanguageModel
): Promise<string | null> {
  if (!messages || messages.length === 0) {
    return null;
  }

  try {
    // Append a user message asking for the summary
    const messagesWithPrompt: ModelMessage[] = [
      ...messages,
      {
        role: "user",
        content: "Summarize the conversation above in 3-5 sentences, capturing key points and decisions."
      }
    ];

    const { text } = await generateText({
      model,
      messages: messagesWithPrompt,
    });

    return text;
  } catch (error) {
    console.error("[LLM Utils] Summarization failed:", error);
    return null;
  }
}
