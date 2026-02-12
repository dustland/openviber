/**
 * Context Management for LLM Conversations
 * Handles token counting, message compression, and context window management
 */

import type { ModelMessage } from "ai";

/**
 * Simple token estimation (4 chars ≈ 1 token)
 * For production, use a proper tokenizer like tiktoken
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ContextBudget {
  totalLimit: number;
  systemPrompt: number;
  tools: number;
  completion: number;
  overhead: number;
  availableForMessages: number;
}

/**
 * Calculate token budget for messages
 */
export function calculateContextBudget(
  totalLimit: number,
  systemPrompt: string,
  toolsText: string = "",
  completionTokens: number = 4000
): ContextBudget {
  const systemTokens = estimateTokenCount(systemPrompt);
  const toolTokens = estimateTokenCount(toolsText);
  const overhead = 500; // Safety margin

  const availableForMessages =
    totalLimit - systemTokens - toolTokens - completionTokens - overhead;

  return {
    totalLimit,
    systemPrompt: systemTokens,
    tools: toolTokens,
    completion: completionTokens,
    overhead,
    availableForMessages,
  };
}

/**
 * Compress messages to fit within context window
 */
export async function compressMessages(
  messages: ModelMessage[],
  budget: ContextBudget
): Promise<ModelMessage[]> {
  // Calculate current token usage
  let totalTokens = messages.reduce(
    (sum, msg) => sum + estimateTokenCount(JSON.stringify(msg)),
    0
  );

  // If within budget, return as-is
  if (totalTokens <= budget.availableForMessages) {
    return messages;
  }

  console.log(
    `[Context] Compressing messages: ${totalTokens} tokens > ${budget.availableForMessages} budget`
  );

  // Strategy 1: Summarize old messages (for long conversations)
  if (messages.length > 10) {
    const summaryResult = await summarizeConversation(messages.slice(0, -8));
    if (summaryResult) {
      const compressedMessages: ModelMessage[] = [
        {
          role: "system",
          content: `[Previous conversation summary: ${summaryResult}]`,
        },
        ...messages.slice(-8),
      ];

      const newTokens = compressedMessages.reduce(
        (sum, msg) => sum + estimateTokenCount(JSON.stringify(msg)),
        0
      );

      if (newTokens <= budget.availableForMessages) {
        console.log(
          `[Context] Summarized: ${messages.length} → ${compressedMessages.length} messages`
        );
        return compressedMessages;
      }
    }
  }

  // Strategy 2: Progressive truncation
  const truncated = [...messages];
  while (totalTokens > budget.availableForMessages && truncated.length > 1) {
    // Keep system messages if possible
    const indexToRemove = truncated[0].role === "system" ? 1 : 0;

    if (indexToRemove >= truncated.length) break;

    const removed = truncated.splice(indexToRemove, 1)[0];
    totalTokens -= estimateTokenCount(JSON.stringify(removed));
  }

  console.log(
    `[Context] Truncated: ${messages.length} → ${truncated.length} messages`
  );

  return truncated;
}

/**
 * Summarize a conversation (placeholder - should use LLM in production)
 */
async function summarizeConversation(
  messages: ModelMessage[]
): Promise<string | null> {
  // In production, this should use an LLM to generate a proper summary
  // For now, just extract key points

  try {
    const keyPoints: string[] = [];

    for (const msg of messages) {
      if (msg.role === "user" && typeof msg.content === "string") {
        // Extract first 100 chars of user messages
        keyPoints.push(msg.content.substring(0, 100) + "...");
      }
    }

    return keyPoints.slice(0, 5).join("; ");
  } catch (error) {
    console.error("[Context] Summarization failed:", error);
    return null;
  }
}

/**
 * Validate final context before sending to LLM
 */
export function validateContext(
  messages: ModelMessage[],
  budget: ContextBudget
): { valid: boolean; reason?: string } {
  const messageTokens = messages.reduce(
    (sum, msg) => sum + estimateTokenCount(JSON.stringify(msg)),
    0
  );

  const totalTokens =
    budget.systemPrompt +
    messageTokens +
    budget.tools +
    budget.completion;

  if (totalTokens > budget.totalLimit * 0.95) {
    return {
      valid: false,
      reason: `Token count (${totalTokens}) exceeds 95% of limit (${budget.totalLimit})`,
    };
  }

  return { valid: true };
}