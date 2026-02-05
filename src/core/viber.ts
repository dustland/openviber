/**
 * Viber - The stateless agent orchestrator
 *
 * Viber is the primary interface for running AI agents. It wraps an Agent
 * with convenience methods for common operations while remaining stateless.
 * All context (conversation history, plans, artifacts) is managed externally
 * by the Viber Board and passed in per-request.
 */

import { Agent, AgentContext, AgentResponse } from "./agent";
import { AgentConfig } from "./config";
import { ViberMessage } from "./message";

export interface ViberOptions {
  model?: string;
  agentId?: string;
  singleAgentId?: string; // Alias for agentId (backward compat)
  config?: Partial<AgentConfig>;
}

export interface ViberStreamOptions {
  messages: ViberMessage[];
  system?: string;
  plan?: string; // Optional plan context (markdown or structured)
  memory?: string; // Optional memory excerpt
  artifacts?: Array<{ id: string; title?: string; type?: string; ref?: string }>;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ViberResult {
  text: string;
  summary?: string;
  artifactRefs?: Array<{ id: string; title?: string; type?: string; ref?: string }>;
  toolCalls?: any[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Viber - Stateless agent wrapper
 *
 * Unlike the legacy ViberAgent, this class:
 * - Does NOT manage Space, Plan, or Task state
 * - Does NOT persist conversation history
 * - Receives all context per-request and returns results
 * - Delegates to Agent for actual LLM interaction
 */
export class Viber {
  private agent: Agent;
  public readonly agentId: string;

  constructor(config: AgentConfig, options?: ViberOptions) {
    // Merge options into config
    const mergedConfig: AgentConfig = {
      ...config,
      ...(options?.config || {}),
      ...(options?.model && { model: options.model }),
    };

    this.agent = new Agent(mergedConfig);
    this.agentId = options?.agentId || config.id || config.name;
  }

  /**
   * Get the underlying agent
   */
  getAgent(): Agent {
    return this.agent;
  }

  /**
   * Stream text response
   *
   * Context (plan, memory, artifacts) is injected into the system prompt.
   * The Viber Board is responsible for persisting and re-sending context.
   */
  async streamText(options: ViberStreamOptions): Promise<any> {
    const { messages, system, plan, memory, artifacts, metadata, ...rest } = options;

    // Build enriched system prompt with context
    const systemPrompt = this.buildSystemPrompt(system, { plan, memory, artifacts });

    return this.agent.streamText({
      messages,
      system: systemPrompt,
      metadata: {
        ...metadata,
        agentId: this.agentId,
      },
      ...rest,
    });
  }

  /**
   * Generate text response (non-streaming)
   */
  async generateText(options: ViberStreamOptions): Promise<any> {
    const { messages, system, plan, memory, artifacts, metadata, ...rest } = options;

    // Build enriched system prompt with context
    const systemPrompt = this.buildSystemPrompt(system, { plan, memory, artifacts });

    return this.agent.generateText({
      messages,
      system: systemPrompt,
      metadata: {
        ...metadata,
        agentId: this.agentId,
      },
      ...rest,
    });
  }

  /**
   * Build system prompt with injected context
   */
  private buildSystemPrompt(
    baseSystem?: string,
    context?: {
      plan?: string;
      memory?: string;
      artifacts?: Array<{ id: string; title?: string; type?: string; ref?: string }>;
    }
  ): string | undefined {
    const parts: string[] = [];

    if (baseSystem) {
      parts.push(baseSystem);
    }

    if (context?.memory) {
      parts.push("\n<memory>");
      parts.push(context.memory);
      parts.push("</memory>");
    }

    if (context?.plan) {
      parts.push("\n<plan>");
      parts.push(context.plan);
      parts.push("</plan>");
    }

    if (context?.artifacts && context.artifacts.length > 0) {
      parts.push("\n<artifacts>");
      for (const artifact of context.artifacts) {
        parts.push(`- ${artifact.title || artifact.id} (${artifact.type || "file"})${artifact.ref ? `: ${artifact.ref}` : ""}`);
      }
      parts.push("</artifacts>");
    }

    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  /**
   * Get agent summary
   */
  getSummary(): Record<string, any> {
    return {
      ...this.agent.getSummary(),
      agentId: this.agentId,
    };
  }

  /**
   * Static factory to create a Viber instance from config
   */
  static create(config: AgentConfig, options?: ViberOptions): Viber {
    return new Viber(config, options);
  }
}

// Re-export Agent for direct use when Viber wrapper isn't needed
export { Agent } from "./agent";
export type { AgentConfig } from "./config";
export type { AgentContext, AgentResponse } from "./agent";
