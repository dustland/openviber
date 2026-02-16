/**
 * AgentSwarm - Multi-agent coordination layer
 *
 * This separates concerns: Agent = single executor, AgentSwarm = coordination
 * Inspired by ZeroClaw's approach where coordination is separate from execution
 */

import type { Space } from "../worker/space";
import type { Agent, AgentContext } from "../worker/agent";

export interface SwarmTask {
  id: string;
  agentId: string;
  input: string;
  context?: AgentContext;
  priority: number;
}

export interface SwarmResult {
  taskId: string;
  agentId: string;
  result: string;
  error?: string;
}

/**
 * ParallelExecutionEngine - executes multiple agents concurrently
 */
export class ParallelExecutionEngine {
  constructor(private space: Space) {}

  /**
   * Execute multiple agents in parallel and aggregate results
   */
  async executeParallel(tasks: SwarmTask[]): Promise<SwarmResult[]> {
    console.log(`[Swarm] Parallel execution: ${tasks.length} agents`);

    const results: SwarmResult[] = [];

    // Execute all tasks in parallel
    const promises = tasks.map(async (task) => {
      try {
        const agent = this.space.getAgent(task.agentId);
        if (!agent) {
          return {
            taskId: task.id,
            agentId: task.agentId,
            result: "",
            error: `Agent '${task.agentId}' not found`,
          };
        }

        const response = await agent.streamText({
          messages: [{ role: "user", content: task.input }],
          spaceId: this.space.spaceId,
          metadata: task.context?.metadata,
        });

        // Collect the full text response
        let fullText = "";
        for await (const chunk of response.textStream) {
          fullText += chunk;
        }

        return {
          taskId: task.id,
          agentId: task.agentId,
          result: fullText,
        };
      } catch (error: any) {
        return {
          taskId: task.id,
          agentId: task.agentId,
          result: "",
          error: error?.message || String(error),
        };
      }
    });

    const settled = await Promise.all(promises);
    results.push(...settled);

    return results;
  }
}

/**
 * AgentSwarm - coordinates multiple agents for complex tasks
 *
 * Responsibilities:
 * - Route requests to appropriate agents
 * - Execute agents in parallel when beneficial
 * - Aggregate results from multiple agents
 */
export class AgentSwarm {
  private parallelEngine: ParallelExecutionEngine;

  constructor(private space: Space) {
    this.parallelEngine = new ParallelExecutionEngine(space);
  }

  /**
   * Route a request to the appropriate agent
   * - If agentId is specified, use that agent directly
   * - Otherwise, route based on task type/content (future enhancement)
   */
  async route(agentId: string, input: string, context?: AgentContext): Promise<string> {
    const agent = this.space.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found in space`);
    }

    console.log(`[Swarm] Routing to '${agentId}'`);

    const response = await agent.streamText({
      messages: [{ role: "user", content: input }],
      spaceId: this.space.spaceId,
      metadata: context?.metadata,
    });

    // Collect the full text response
    let fullText = "";
    for await (const chunk of response.textStream) {
      fullText += chunk;
    }

    return fullText;
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel(agentIds: string[], input: string, context?: AgentContext): Promise<SwarmResult[]> {
    const tasks: SwarmTask[] = agentIds.map((agentId, index) => ({
      id: `parallel-${agentId}-${Date.now()}-${index}`,
      agentId,
      input,
      context,
      priority: agentIds.length - index, // First agent gets highest priority
    }));

    return this.parallelEngine.executeParallel(tasks);
  }

  /**
   * List available agents in this swarm
   */
  getAvailableAgents(): string[] {
    return Array.from(this.space.agents.keys());
  }

  /**
   * Check if an agent is available
   */
  hasAgent(agentId: string): boolean {
    return this.space.agents.has(agentId);
  }
}
