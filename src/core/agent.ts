/**
 * Agent - Config-driven agent implementation
 *
 * Agents are defined entirely by configuration, not code.
 * Each agent is instantiated from a config object that defines
 * its role, tools, and LLM settings.
 */

import { generateText, streamText } from "ai";
import type { LanguageModel, CoreMessage } from "ai";
import { getViberPath } from "../config";
import { AgentConfig } from "./config";
import { ConversationHistory, ViberMessage } from "./message";
import { getModelProvider } from "./provider";
import { buildToolMap } from "./tool";
import { generateShortId } from "../utils/id";

export interface AgentContext {
  spaceId: string;
  taskId?: string;
  conversationHistory: ConversationHistory;
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  text: string;
  toolCalls?: any[];
  reasoning?: string;
  metadata?: Record<string, any>;
}

/**
 * Config-driven Agent implementation
 * No subclasses needed - behavior is entirely config-driven
 */
export class Agent {
  public id: string; // Agent ID (filename without extension)
  public name: string; // Display name
  public description: string;
  public config: AgentConfig; // Store the original config

  // LLM configuration
  public provider: string;
  public model: string;
  public temperature?: number;
  public maxTokens?: number;
  public topP?: number;
  public frequencyPenalty?: number;
  public presencePenalty?: number;
  public systemPrompt?: string;

  // Agent configuration
  public tools: string[];
  public personality?: string;

  constructor(config: AgentConfig) {
    this.config = config; // Store the original config
    this.id = config.id || config.name; // Use ID if provided, otherwise fallback to name
    this.name = config.name;
    this.description = config.description;

    // LLM settings - handle llm or inline config
    if (config.llm) {
      // New llm config format
      this.provider = config.llm.provider;
      this.model = config.llm.model;
      this.temperature = config.llm.settings?.temperature;
      this.maxTokens = config.llm.settings?.maxTokens;
      this.topP = config.llm.settings?.topP;
      this.frequencyPenalty = config.llm.settings?.frequencyPenalty;
      this.presencePenalty = config.llm.settings?.presencePenalty;
      this.systemPrompt = config.systemPrompt;
    } else {
      // Inline config
      this.provider = config.provider!;
      this.model = config.model!;
      this.temperature = config.temperature;
      this.maxTokens = config.maxTokens;
      this.topP = config.topP;
      this.frequencyPenalty = config.frequencyPenalty;
      this.presencePenalty = config.presencePenalty;
      this.systemPrompt = config.systemPrompt;
    }

    // Validate that 'viber' is never used as a provider
    // Viber is a team orchestration system, not an AI provider
    if (this.provider === "viber" || this.provider?.startsWith("viber-")) {
      throw new Error(
        `Invalid provider '${this.provider}' for agent '${this.name}'. ` +
        `'viber' is a team orchestration system, not an AI provider. ` +
        `Use 'openai', 'anthropic', 'deepseek', etc. as providers.`
      );
    }

    // Configuration
    this.tools = config.tools || [];
    this.personality = config.personality;
  }

  /**
   * Get the system prompt for this agent
   */
  protected getSystemPrompt(context?: AgentContext): string {
    const segments: string[] = [];

    // Base identity
    segments.push(`You are ${this.name}.`);
    segments.push(this.description);

    // Personality
    if (this.personality) {
      segments.push(`\nPersonality: ${this.personality}`);
    }

    // Tool usage instructions - especially important for DeepSeek
    if (this.tools && this.tools.length > 0) {
      segments.push("\nIMPORTANT - TOOL USAGE:");
      segments.push("You have tools available. To use a tool, you MUST:");
      segments.push("1. Use the tool calling mechanism provided by the system");
      segments.push(
        "2. NEVER output tool calls as JSON, code blocks, or plain text"
      );
      segments.push("3. The system will automatically handle tool execution");
      segments.push(
        "When you need to call a tool, simply invoke it directly without any formatting."
      );
    }

    // Custom system prompt
    if (this.systemPrompt) {
      segments.push(`\n${this.systemPrompt}`);
    }

    // Context information
    if (context) {
      segments.push("\nCurrent Context:");
      segments.push(`- Space ID: ${context.spaceId}`);
      if (context.taskId) {
        segments.push(`- Task ID: ${context.taskId}`);
      }
      if (context.metadata) {
        // Add artifact context specifically if artifactId is present
        if (context.metadata.artifactId) {
          // Use the path from artifact metadata if available, otherwise construct it
          let fullPath = context.metadata.artifactPath;

          if (!fullPath) {
            // Fallback: construct path if not provided
            fullPath = getViberPath(
              "spaces",
              context.spaceId,
              "artifacts",
              context.metadata.artifactId
            );
          }

          // Get original filename from metadata
          const displayName =
            context.metadata.artifactName || context.metadata.artifactId;

          // Determine if this is a document that office tools can handle
          const isOfficeDocument = fullPath.match(/\.(docx?|xlsx?|pptx?)$/i);
          const isPdf = fullPath.match(/\.pdf$/i);
          const isImage = fullPath.match(/\.(png|jpe?g|gif|bmp|svg)$/i);

          if (isOfficeDocument) {
            segments.push(`\nCURRENT DOCUMENT:`);
            segments.push(
              `You have an active Office document that the user has already uploaded and selected.`
            );
            segments.push(`Document filepath: "${fullPath}"`);
            segments.push(
              `(This is the complete path you need to use when calling document tools)`
            );
            segments.push(
              `To read or process this document, use your available tools with filepath: ${fullPath}`
            );
            segments.push(
              `The user expects you to work directly with this document - do not ask them to upload it again.`
            );
          } else {
            segments.push(`\nCURRENT FILE:`);
            segments.push(
              `You have an active file that the user has already uploaded and selected.`
            );
            segments.push(`File: "${displayName}" (${fullPath})`);
            if (isPdf) {
              segments.push(
                `This is a PDF file. Use appropriate PDF processing tools if available.`
              );
            } else if (isImage) {
              segments.push(
                `This is an image file. You can reference it in your responses or use image processing tools if available.`
              );
            } else {
              segments.push(
                `This is a ${fullPath.split(".").pop()?.toUpperCase() || "unknown"
                } file.`
              );
            }
            segments.push(
              `The user expects you to work with this file directly when relevant to their request.`
            );
          }
        }
        // Add other metadata (skip artifact-related fields to avoid confusion)
        const artifactFields = ["artifactId", "artifactName", "artifactPath"];
        for (const [key, value] of Object.entries(context.metadata)) {
          if (!artifactFields.includes(key)) {
            // Skip all artifact-related fields
            segments.push(`- ${key}: ${value}`);
          }
        }
      }
    }

    // Add current date and time context
    const now = new Date();
    segments.push("\nDate/Time Information:");
    segments.push(`- Current Date: ${now.toISOString().split("T")[0]}`);
    segments.push(`- Current Time: ${now.toTimeString().split(" ")[0]}`);
    segments.push(
      `- Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
    );

    return segments.join("\n");
  }

  /**
   * Get the model provider for this agent
   */
  public getModel(context?: { spaceId?: string; userId?: string }): LanguageModel {
    const modelProvider = getModelProvider({
      provider: this.provider as any,
      modelName: this.model,
      spaceId: context?.spaceId,
      userId: context?.userId,
    });

    // All providers (OpenAI, Anthropic, DeepSeek) are functions
    // that need to be called with the model name
    return (modelProvider as any)(this.model) as LanguageModel;
  }

  /**
   * Get tools available to this agent
   */
  protected async getTools(context?: { spaceId?: string }): Promise<any> {
    // Only load tools if configured
    if (this.tools && this.tools.length > 0) {
      try {
        return await buildToolMap(this.tools, context);
      } catch (error) {
        console.error(`Failed to load tools for agent ${this.name}:`, error);
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Prepare debug info without actually calling streamText
   * Returns all the parameters that would be sent to the LLM
   */
  async prepareDebugInfo(options: {
    messages: ViberMessage[];
    system?: string;
    spaceId?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    systemPrompt: string;
    tools: any;
    model: any;
    agentInfo: any;
    messages: any[];
  }> {
    const { messages: viberMessages, system, spaceId, metadata } = options;

    // Extract metadata from messages for context enrichment
    let enrichedMetadata = metadata || {};

    // Find the last user message to extract any document context or other metadata
    const lastUserMsg = viberMessages.filter((m) => m.role === "user").pop();
    if (lastUserMsg?.metadata) {
      enrichedMetadata = { ...lastUserMsg.metadata, ...metadata };
    }

    // Build context for system prompt generation using ViberMessages
    const context: AgentContext = {
      spaceId: spaceId || "default",
      conversationHistory: new ConversationHistory(),
      metadata: enrichedMetadata,
    };

    // Use agent-specific prompt and append any extra system context
    const basePrompt = this.getSystemPrompt(context);
    const systemPrompt = system ? `${basePrompt}\n\n${system}` : basePrompt;
    const tools = await this.getTools({ spaceId });

    // Convert messages for display
    const modelMessages: any[] = viberMessages
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : Array.isArray(m.content)
              ? (m.content as Array<{ type: string; text?: string }>)
                .filter((p) => p.type === "text" && p.text)
                .map((p) => p.text as string)
                .join("\n")
              : "",
      }))
      .filter((m) => m.content);

    return {
      systemPrompt,
      tools: Object.entries(tools || {}).map(([id, tool]) => ({
        id,
        name: (tool as any).name || id,
        description: (tool as any).description,
        functions: Object.keys((tool as any).functions || {}),
      })),
      model: {
        provider:
          this.config.llm?.provider || this.config.provider || "unknown",
        model: this.config.llm?.model || this.config.model || "unknown",
        settings: {
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          topP: this.topP,
          frequencyPenalty: this.frequencyPenalty,
          presencePenalty: this.presencePenalty,
        },
      },
      agentInfo: {
        id: this.id,
        name: this.name,
        description: this.description,
        personality: this.personality,
      },
      messages: modelMessages,
    };
  }

  /**
   * Stream text - works with ViberMessage[] internally
   * Converts to ModelMessage[] only when calling AI SDK
   */
  async streamText(options: {
    messages: ViberMessage[];
    system?: string;
    spaceId?: string;
    metadata?: Record<string, any>;
    [key: string]: any; // Allow all other AI SDK options to pass through
  }): Promise<any> {
    // Extract context-specific options
    const {
      messages: viberMessages,
      system,
      spaceId,
      metadata,
      ...aiSdkOptions
    } = options;

    // Extract metadata from messages for context enrichment
    let enrichedMetadata = metadata || {};

    // Find the last user message to extract any document context or other metadata
    const lastUserMsg = viberMessages.filter((m) => m.role === "user").pop();
    if (lastUserMsg?.metadata) {
      enrichedMetadata = { ...lastUserMsg.metadata, ...metadata };
    }

    // Build context for system prompt generation using ViberMessages
    const context: AgentContext = {
      spaceId: spaceId || "default",
      conversationHistory: new ConversationHistory(),
      metadata: enrichedMetadata,
    };

    // Use agent-specific prompt and append any extra system context
    const basePrompt = this.getSystemPrompt(context);
    const systemPrompt = system ? `${basePrompt}\n\n${system}` : basePrompt;

    const model = this.getModel({ spaceId, userId: enrichedMetadata.userId });
    const tools = await this.getTools({ spaceId });

    // Generate a message ID that includes the agent name
    const agentPrefix = this.name.toLowerCase().replace(/\s+/g, "-");

    // Convert ViberMessage[] to CoreMessage[] ONLY here, right before AI SDK call
    const modelMessages: CoreMessage[] = viberMessages
      .filter((m) => m.role !== "tool") // Skip tool messages
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content:
          typeof m.content === "string"
            ? m.content
            : Array.isArray(m.content)
              ? (m.content as Array<{ type: string; text?: string }>)
                .filter((p) => p.type === "text" && p.text)
                .map((p) => p.text as string)
                .join("\n")
              : "",
      }))
      .filter((m) => m.content); // Remove empty messages

    // Pass through to AI SDK's streamText with agent defaults
    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      toolChoice: "auto", // Explicitly set tool choice mode
      maxSteps: 5, // Allow up to 5 tool call steps
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      topP: this.topP,
      frequencyPenalty: this.frequencyPenalty,
      presencePenalty: this.presencePenalty,
      maxRetries: 3,
      // Add callback to monitor tool calls
      onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
        console.log(`[${this.name}] Step finished:`, {
          finishReason,
          hasText: !!text,
          toolCallsCount: toolCalls?.length || 0,
          toolResultsCount: toolResults?.length || 0,
        });

        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((toolCall) => {
            console.log(`[${this.name}] Tool Call:`, {
              toolName: toolCall.toolName,
              args: toolCall.args,
              // Focus on filepath-related arguments
              hasFilePath:
                toolCall.args &&
                typeof toolCall.args === "object" &&
                ("filepath" in toolCall.args ||
                  "file_path" in toolCall.args ||
                  "path" in toolCall.args),
              pathValues:
                toolCall.args && typeof toolCall.args === "object"
                  ? Object.entries(toolCall.args)
                    .filter(
                      ([key]) =>
                        key.toLowerCase().includes("path") ||
                        key.toLowerCase().includes("file")
                    )
                    .reduce(
                      (acc, [key, value]) => ({ ...acc, [key]: value }),
                      {}
                    )
                  : {},
            });
          });
        }

        if (toolResults && toolResults.length > 0) {
          toolResults.forEach((result, index) => {
            console.log(`[${this.name}] Tool Result [${index}]:`, {
              toolName: result.toolName,
              hasResult: result.result !== undefined,
              result: result.result,
            });
          });
        }
      },
      // Override with any provided options
      ...aiSdkOptions,
      // Use experimental_generateMessageId to include agent name in message ID
      // @ts-ignore - experimental feature may not be in types yet
      experimental_generateMessageId: () => {
        return `${agentPrefix}_${generateShortId()}`;
      },
    });

    // Attach agent metadata to the result for immediate access
    (result as any).agentMetadata = {
      name: this.name,
    };

    return result;
  }

  /**
   * Generate text - works with ViberMessage[] internally
   * Converts to ModelMessage[] only when calling AI SDK
   */
  async generateText(options: {
    messages: ViberMessage[];
    system?: string;
    spaceId?: string;
    metadata?: Record<string, any>;
    [key: string]: any;
  }): Promise<any> {
    const {
      messages: viberMessages,
      system,
      spaceId,
      metadata,
      ...aiSdkOptions
    } = options;

    // Extract metadata from messages for context enrichment
    let enrichedMetadata = metadata || {};

    // Find the last user message to extract any document context or other metadata
    const lastUserMsg = viberMessages.filter((m) => m.role === "user").pop();
    if (lastUserMsg?.metadata) {
      enrichedMetadata = { ...lastUserMsg.metadata, ...metadata };
    }

    // Build context for system prompt generation
    const context: AgentContext = {
      spaceId: spaceId || "default",
      conversationHistory: new ConversationHistory(),
      metadata: enrichedMetadata,
    };

    // Use agent-specific prompt and append any extra system context
    const basePrompt = this.getSystemPrompt(context);
    const systemPrompt = system ? `${basePrompt}\n\n${system}` : basePrompt;

    const model = this.getModel({ spaceId, userId: enrichedMetadata.userId });
    const tools = await this.getTools({ spaceId });

    // Convert ViberMessage[] to CoreMessage[] ONLY here, right before AI SDK call
    const modelMessages: CoreMessage[] = viberMessages
      .filter((m) => m.role !== "tool") // Skip tool messages
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content:
          typeof m.content === "string"
            ? m.content
            : Array.isArray(m.content)
              ? (m.content as Array<{ type: string; text?: string }>)
                .filter((p) => p.type === "text" && p.text)
                .map((p) => p.text as string)
                .join("\n")
              : "",
      }))
      .filter((m) => m.content);

    // Pass through to AI SDK's generateText with proper options
    return generateText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      temperature: this.temperature,
      maxRetries: 3,
      ...aiSdkOptions,
      // Add model-specific options if they exist
      ...(this.maxTokens && { maxSteps: 5 }), // generateText uses maxSteps not maxTokens
      ...(this.topP && { topP: this.topP }),
      ...(this.frequencyPenalty && { frequencyPenalty: this.frequencyPenalty }),
      ...(this.presencePenalty && { presencePenalty: this.presencePenalty }),
    });
  }

  /**
   * Get agent summary
   */
  getSummary(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      tools: this.tools,
      llmModel: `${this.provider}/${this.model}`,
    };
  }
}
