/**
 * Agent - Config-driven agent implementation
 *
 * Agents are defined entirely by configuration, not code.
 * Each agent is instantiated from a config object that defines
 * its role, tools, and LLM settings.
 */

import { generateText, streamText, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { getViberPath } from "../config";
import { AgentConfig } from "./config";
import { ConversationHistory, ViberMessage } from "./message";
import { getModelProvider } from "./provider";
import { buildToolMap } from "./tool";
import {
  applyWorkingModeToTools,
  resolveRequireApprovalTools,
  resolveWorkingMode,
} from "./working-mode";
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
import { defaultRegistry } from "../skills/registry";
import "../skills"; // trigger registerDefaultSkills() side-effect

/**
 * Config-driven Agent implementation
 * No subclasses needed - behavior is entirely config-driven
 */
export class Agent {
  public id: string;
  public name: string;
  public description: string;
  public config: AgentConfig;

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
  public skills: string[];
  public personality?: string;

  // Execution limits
  public maxSteps: number;

  // Working mode
  public mode: "always_ask" | "agent_decides" | "always_execute";
  public requireApproval: Set<string>;

  // Skill state
  private skillInstructions: string = "";
  private loadedSkillTools: Record<string, any> = {};
  private skillsLoaded: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.id = config.id || config.name;
    this.name = config.name;
    this.description = config.description;

    // LLM settings
    if (config.llm) {
      this.provider = config.llm.provider;
      this.model = config.llm.model;
      this.temperature = config.llm.settings?.temperature;
      this.maxTokens = config.llm.settings?.maxTokens;
      this.topP = config.llm.settings?.topP;
      this.frequencyPenalty = config.llm.settings?.frequencyPenalty;
      this.presencePenalty = config.llm.settings?.presencePenalty;
      this.systemPrompt = config.systemPrompt;
    } else {
      this.provider = config.provider!;
      this.model = config.model!;
      this.temperature = config.temperature;
      this.maxTokens = config.maxTokens;
      this.topP = config.topP;
      this.frequencyPenalty = config.frequencyPenalty;
      this.presencePenalty = config.presencePenalty;
      this.systemPrompt = config.systemPrompt;
    }

    if (this.provider === "viber" || this.provider?.startsWith("viber-")) {
      throw new Error(
        `Invalid provider '${this.provider}' for agent '${this.name}'. Viber is not an AI provider.`,
      );
    }

    this.tools = config.tools || [];
    this.skills = config.skills || [];
    this.personality = config.personality;
    this.maxSteps = config.maxSteps ?? 10;
    this.mode = resolveWorkingMode(config);
    this.requireApproval = resolveRequireApprovalTools(config);
  }

  /**
   * Ensure skills are loaded from registry.
   *
   * Skills provide two things:
   * 1. Instructions (from SKILL.md) — injected into the system prompt for
   *    progressive discovery: the agent learns WHEN and HOW to use a skill.
   * 2. Tools — callable functions registered in the skill registry.
   *
   * These are decoupled: instructions require SKILL.md on disk, but tools
   * may already be pre-registered (via preRegisterTools) and should always
   * be loaded even if the SKILL.md isn't found.
   */
  private async ensureSkillsLoaded(): Promise<void> {
    if (this.skillsLoaded) return;

    if (this.skills && this.skills.length > 0) {
      const instructionParts: string[] = [];

      for (const skillId of this.skills) {
        // 1. Progressive discovery: try to load SKILL.md instructions
        const skill = await defaultRegistry.loadSkill(skillId);
        if (skill) {
          console.log(`[Agent] Loaded skill '${skillId}' with ${skill.instructions ? 'instructions' : 'no instructions'}`);
          instructionParts.push(`\n### Skill: ${skill.metadata.name}`);
          instructionParts.push(skill.metadata.description);
          if (skill.instructions) {
            instructionParts.push(skill.instructions);
          }
        } else {
          console.warn(`[Agent] Skill '${skillId}' metadata not found (SKILL.md missing), will still try pre-registered tools`);
        }

        // 2. Tool loading: always try, independent of SKILL.md discovery
        try {
          const tools = await defaultRegistry.getTools(skillId);
          const toolNames = Object.keys(tools);
          if (toolNames.length > 0) {
            console.log(`[Agent] Skill '${skillId}' provides ${toolNames.length} tools: ${toolNames.join(', ')}`);
            Object.assign(this.loadedSkillTools, tools);
          }
        } catch {
          // No tools available (neither pre-registered nor dynamically loaded)
          if (!skill) {
            console.warn(`[Agent] Skill '${skillId}' has no metadata and no tools — skipping entirely`);
          }
        }
      }

      this.skillInstructions = instructionParts.join("\n\n");
    }

    this.skillsLoaded = true;
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

    // Skill Instructions
    if (this.skillInstructions) {
      segments.push("\n=== ENABLED SKILLS ===");
      segments.push(this.skillInstructions);
      segments.push("======================\n");
    }

    // Tool usage instructions
    if (
      (this.tools && this.tools.length > 0) ||
      Object.keys(this.loadedSkillTools).length > 0
    ) {
      segments.push("\nIMPORTANT - TOOL USAGE:");
      segments.push("You have tools available. To use a tool, you MUST:");
      segments.push("1. Use the tool calling mechanism provided by the system");
      segments.push(
        "2. NEVER output tool calls as JSON, code blocks, or plain text",
      );
      segments.push(
        "When you need to call a tool, simply invoke it directly without any formatting.",
      );
      if (Object.keys(this.loadedSkillTools).length > 0) {
        segments.push(
          "When the user asks to use a skill by name (e.g. cursor-agent, tmux), one of your tools is for that—use each tool's description to decide when to call it.",
        );
      }
    }

    // Primary coding CLI preference (from settings): steer agent when multiple coding CLIs are enabled
    const primaryCodingCli = this.config.primaryCodingCli as string | undefined;
    if (
      primaryCodingCli &&
      this.skills.includes(primaryCodingCli)
    ) {
      segments.push(
        "\nFor coding tasks, prefer the tools from the **" +
          primaryCodingCli +
          "** skill. Only use another coding CLI (e.g. codex_run, cursor_agent_run, gemini_run) if the user explicitly asks for it by name.",
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
      if (context.taskId) segments.push(`- Task ID: ${context.taskId}`);

      if (context.metadata) {
        // Add metadata fields
        for (const [key, value] of Object.entries(context.metadata)) {
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ) {
            segments.push(`- ${key}: ${value}`);
          }
        }
      }
    }

    // Add current date and time context
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    segments.push("\nCurrent Date/Time:");
    segments.push(`- Date: ${now.toISOString().split('T')[0]} (${dayOfWeek})`);
    segments.push(`- Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`);
    segments.push(`- Timezone: ${timezone}`);

    return segments.join("\n");
  }

  /**
   * Get the model provider for this agent
   */
  public getModel(context?: {
    spaceId?: string;
    userId?: string;
  }): LanguageModel {
    const modelProvider = getModelProvider({
      provider: this.provider as any,
      modelName: this.model,
      spaceId: context?.spaceId,
      userId: context?.userId,
    });

    // OpenRouter API expects upstream provider/model only (e.g. "deepseek/deepseek-chat"), not "openrouter/..."
    const modelForApi =
      this.provider === "openrouter" && this.model.startsWith("openrouter/")
        ? this.model.slice("openrouter/".length)
        : this.model;

    return (modelProvider as any)(modelForApi) as LanguageModel;
  }

  /**
   * Get tools available to this agent.
   *
   * Converts CoreTool format ({inputSchema}) to AI SDK format ({parameters})
   * so that streamText() recognizes and exposes the tools to the model.
   */
  protected async getTools(context?: {
    spaceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    const tools = { ...this.loadedSkillTools };

    // Only load config tools if configured
    if (this.tools && this.tools.length > 0) {
      try {
        const customTools = await buildToolMap(this.tools, context);
        Object.assign(tools, customTools);
      } catch (error) {
        console.error(`Failed to load tools for agent ${this.name}:`, error);
      }
    }

    // Convert CoreTool ({inputSchema, execute}) → AI SDK ({parameters, execute}).
    // The AI SDK silently ignores tools that lack a `parameters` property.
    // Also injects oauthTokens into the execution context for skills that need it.
    const oauthTokens = (context?.metadata as any)?.oauthTokens;
    const aiSdkTools: Record<string, any> = {};
    for (const [name, tool] of Object.entries(tools) as [string, any][]) {
      let converted: any;
      if (tool.parameters) {
        // Already in AI SDK format
        converted = { ...tool };
      } else if (tool.inputSchema) {
        // Convert CoreTool → AI SDK tool
        converted = {
          ...tool,
          parameters: tool.inputSchema,
        };
      } else {
        // No schema at all — pass through as-is
        converted = { ...tool };
      }

      // Wrap execute to inject oauthTokens into context if available
      if (oauthTokens && typeof converted.execute === "function") {
        const originalExecute = converted.execute;
        converted.execute = (args: any, aiSdkContext?: any) => {
          const enrichedContext = { ...aiSdkContext, oauthTokens };
          return originalExecute(args, enrichedContext);
        };
      }

      aiSdkTools[name] = converted;
    }

    const resolvedTools = Object.keys(aiSdkTools).length > 0 ? aiSdkTools : undefined;

    return applyWorkingModeToTools(resolvedTools, {
      mode: this.mode,
      requireApproval: this.requireApproval,
      metadata: context?.metadata,
    });
  }

  /**
   * Prepare debug info without actually calling streamText
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
    await this.ensureSkillsLoaded();

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
    const tools = await this.getTools({ spaceId, metadata: enrichedMetadata });

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
    await this.ensureSkillsLoaded();

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
    const tools = await this.getTools({ spaceId, metadata: enrichedMetadata });
    console.log(`[Agent] ${this.name} streaming with model=${this.provider}/${this.model}, tools=${tools ? Object.keys(tools).length : 0}: ${tools ? Object.keys(tools).join(', ') : 'none'}`);

    // Generate a message ID that includes the agent name
    const agentPrefix = this.name.toLowerCase().replace(/\s+/g, "-");

    // Convert ViberMessage[] to ModelMessage[] ONLY here, right before AI SDK call
    const modelMessages: ModelMessage[] = viberMessages
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
      stopWhen: stepCountIs(this.maxSteps), // Enable multi-step: continue until no more tool calls or maxSteps reached
      temperature: this.temperature,
      maxOutputTokens: this.maxTokens,
      topP: this.topP,
      frequencyPenalty: this.frequencyPenalty,
      presencePenalty: this.presencePenalty,
      maxRetries: 3,
      // onStepFinish callback for debugging multi-step execution if needed
      onStepFinish: ({ toolCalls }) => {
        if (toolCalls?.length) {
          console.log(`[Agent] Tool calls: ${toolCalls.map(t => t.toolName).join(', ')}`);
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
    await this.ensureSkillsLoaded();

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
    const tools = await this.getTools({ spaceId, metadata: enrichedMetadata });

    // Convert ViberMessage[] to ModelMessage[] ONLY here, right before AI SDK call
    const modelMessages: ModelMessage[] = viberMessages
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
