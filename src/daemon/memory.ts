
import * as fs from "fs/promises";
import * as path from "path";
import { getViberRoot } from "../viber/config";
import { Agent } from "../viber/agent";
import type { AgentConfig } from "../types";

/**
 * Consolidate recent conversation history into long-term memory (MEMORY.md).
 *
 * This function reads the current MEMORY.md, prompts the LLM to update it based on the recent conversation,
 * and writes the updated content back to disk.
 *
 * @param viberId - The ID of the viber (agent instance).
 * @param messages - The conversation history (array of { role, content }).
 * @param agentConfig - The configuration of the agent that performed the task (reused for consolidation).
 */
export async function consolidateMemory(
  viberId: string,
  messages: { role: string; content: string }[],
  agentConfig: AgentConfig
): Promise<void> {
  const root = getViberRoot();
  // Primary path: ~/.openviber/vibers/{viberId}/MEMORY.md
  const memoryPath = path.join(root, "vibers", viberId, "MEMORY.md");

  // Ensure directory exists
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });

  let currentMemory = "";
  try {
    currentMemory = await fs.readFile(memoryPath, "utf-8");
  } catch {
    // File doesn't exist yet, start empty
    currentMemory = "(empty)";
  }

  // Filter messages to extract useful context
  // We skip system messages as they contain the prompt (which includes the memory itself)
  // We also skip large tool outputs to keep the context window manageable
  const conversationText = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const role = m.role.toUpperCase();
      let content = m.content;
      if (typeof content === "string" && content.length > 2000) {
        content = content.slice(0, 2000) + "... (truncated)";
      } else if (typeof content !== "string") {
         content = "[Complex Content]";
      }
      return `${role}: ${content}`;
    })
    .join("\n\n");

  if (!conversationText.trim()) {
    return; // No conversation to consolidate
  }

  const prompt = `You are the memory manager for an AI agent.
Your job is to update the long-term memory (MEMORY.md) based on the latest conversation.

## Current MEMORY.md
${currentMemory}

## Recent Conversation
${conversationText}

## Instructions
1. Extract any permanent facts, user preferences, project context, or important decisions learned during this conversation.
2. Update existing facts if they have changed.
3. Remove obsolete information if contradicted by new facts.
4. Do not store trivial details, short-term context, or greetings.
5. Maintain a clean, organized Markdown format (e.g., using headers for sections like "User Preferences", "Project Context").
6. Output the FULLY UPDATED content of MEMORY.md. Do not use code blocks unless the memory content itself requires them. Do not include any conversational text like "Here is the updated memory".

Output ONLY the raw content of the updated MEMORY.md file.`;

  try {
    // Create a temporary agent for consolidation using the same config/model
    // We override the system prompt to force it into "Memory Manager" mode
    const memoryAgent = new Agent({
      ...agentConfig,
      systemPrompt: "You are a precise memory management system. Output only raw text.",
      // Ensure we don't carry over task-specific tools/skills that might confuse the model
      tools: [],
      skills: [],
    });

    const result = await memoryAgent.generateText({
      messages: [{ role: "user", content: prompt }],
    });

    let updatedMemory = result.text.trim();

    // Cleanup: Remove wrapping markdown code blocks if the model added them despite instructions
    if (updatedMemory.startsWith("```markdown")) {
      updatedMemory = updatedMemory.replace(/^```markdown\n/, "").replace(/\n```$/, "");
    } else if (updatedMemory.startsWith("```")) {
      updatedMemory = updatedMemory.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    if (updatedMemory && updatedMemory !== currentMemory) {
      await fs.writeFile(memoryPath, updatedMemory, "utf-8");
      // console.log(`[Memory] Updated MEMORY.md for ${viberId}`);
    }
  } catch (error) {
    console.error(`[Memory] Failed to consolidate memory for ${viberId}:`, error);
  }
}
