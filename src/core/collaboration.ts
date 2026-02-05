/**
 * Collaboration Module - Multi-Agent Collaboration Engine
 *
 * Provides:
 * - Parallel agent execution
 * - Agent-to-agent communication
 * - Shared context management
 * - Collaborative planning
 */

import { Agent } from "./agent";
import { Space } from "./space";
import type { AgentResponse } from "./agent";

export interface AgentMessage {
  from: string; // Agent ID
  to: string; // Agent ID or 'broadcast'
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface SharedContext {
  spaceId: string;
  data: Record<string, any>;
  updatedAt: Date;
  updatedBy: string; // Agent ID
}

export interface ParallelTask {
  id: string;
  agentId: string;
  messages: any[];
  system?: string;
  metadata?: Record<string, any>;
  priority?: number; // Higher = more important
}

export interface ParallelExecutionResult {
  taskId: string;
  agentId: string;
  result: AgentResponse;
  error?: Error;
  duration: number;
}

/**
 * Agent Collaboration Manager
 * Handles agent-to-agent communication and shared context
 */
export class AgentCollaborationManager {
  private space: Space;
  private messageQueue: Map<string, AgentMessage[]>; // Agent ID -> messages
  private sharedContext: SharedContext;
  private listeners: Map<string, Set<(message: AgentMessage) => void>>;

  constructor(space: Space) {
    this.space = space;
    this.messageQueue = new Map();
    this.sharedContext = {
      spaceId: space.spaceId,
      data: {},
      updatedAt: new Date(),
      updatedBy: "system",
    };
    this.listeners = new Map();
  }

  /**
   * Send a message from one agent to another
   */
  sendMessage(
    from: string,
    to: string,
    content: string,
    metadata?: Record<string, any>
  ): void {
    const message: AgentMessage = {
      from,
      to,
      content,
      metadata,
      timestamp: new Date(),
    };

    if (to === "broadcast") {
      // Broadcast to all agents
      for (const agentId of this.space.agents.keys()) {
        if (agentId !== from) {
          this.queueMessage(agentId, message);
        }
      }
    } else {
      // Send to specific agent
      this.queueMessage(to, message);
    }

    // Notify listeners
    this.notifyListeners(to, message);
    if (to !== "broadcast") {
      this.notifyListeners("broadcast", message);
    }
  }

  /**
   * Queue a message for an agent
   */
  private queueMessage(agentId: string, message: AgentMessage): void {
    if (!this.messageQueue.has(agentId)) {
      this.messageQueue.set(agentId, []);
    }
    this.messageQueue.get(agentId)!.push(message);
  }

  /**
   * Get pending messages for an agent
   */
  getMessages(agentId: string): AgentMessage[] {
    const messages = this.messageQueue.get(agentId) || [];
    this.messageQueue.set(agentId, []); // Clear after reading
    return messages;
  }

  /**
   * Subscribe to messages for an agent
   */
  subscribe(
    agentId: string,
    callback: (message: AgentMessage) => void
  ): () => void {
    if (!this.listeners.has(agentId)) {
      this.listeners.set(agentId, new Set());
    }
    this.listeners.get(agentId)!.add(callback);

    return () => {
      const callbacks = this.listeners.get(agentId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(agentId);
        }
      }
    };
  }

  /**
   * Notify listeners of a new message
   */
  private notifyListeners(agentId: string, message: AgentMessage): void {
    const callbacks = this.listeners.get(agentId);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(message);
        } catch (error) {
          console.error(`[AgentCollaborationManager] Listener error:`, error);
        }
      });
    }
  }

  /**
   * Update shared context
   */
  updateContext(agentId: string, updates: Record<string, any>): void {
    this.sharedContext.data = {
      ...this.sharedContext.data,
      ...updates,
    };
    this.sharedContext.updatedAt = new Date();
    this.sharedContext.updatedBy = agentId;
  }

  /**
   * Get shared context
   */
  getContext(): SharedContext {
    return { ...this.sharedContext };
  }

  /**
   * Get a specific value from shared context
   */
  getContextValue(key: string): any {
    return this.sharedContext.data[key];
  }
}

/**
 * Parallel Execution Engine
 * Executes multiple agent tasks in parallel
 */
export class ParallelExecutionEngine {
  private space: Space;
  private maxConcurrency: number;
  private activeTasks: Map<string, Promise<ParallelExecutionResult>>;

  constructor(space: Space, maxConcurrency: number = 3) {
    this.space = space;
    this.maxConcurrency = maxConcurrency;
    this.activeTasks = new Map();
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeParallel(
    tasks: ParallelTask[]
  ): Promise<ParallelExecutionResult[]> {
    // Sort by priority (higher first)
    const sortedTasks = [...tasks].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    // Execute in batches
    const results: ParallelExecutionResult[] = [];
    const executing: Promise<ParallelExecutionResult>[] = [];

    for (const task of sortedTasks) {
      // Wait if we've reached max concurrency
      if (executing.length >= this.maxConcurrency) {
        const completed = await Promise.race(executing);
        const index = executing.findIndex(
          (p) => p === Promise.resolve(completed)
        );
        if (index >= 0) {
          executing.splice(index, 1);
        }
        results.push(completed);
      }

      // Start execution
      const promise = this.executeTask(task);
      executing.push(promise);
      this.activeTasks.set(task.id, promise);
    }

    // Wait for remaining tasks
    const remaining = await Promise.allSettled(executing);
    for (const result of remaining) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // Handle rejected promises
        console.error("[ParallelExecutionEngine] Task failed:", result.reason);
      }
    }

    this.activeTasks.clear();
    return results;
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: ParallelTask
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();

    try {
      const agent = this.space.getAgent(task.agentId);
      if (!agent) {
        throw new Error(`Agent ${task.agentId} not found`);
      }

      // Execute agent
      const result = await agent.generateText({
        messages: task.messages,
        system: task.system,
        spaceId: this.space.spaceId,
        metadata: {
          ...task.metadata,
          parallelTaskId: task.id,
        },
      });

      const duration = Date.now() - startTime;

      return {
        taskId: task.id,
        agentId: task.agentId,
        result: {
          text: result.text || "",
          toolCalls: result.toolCalls,
          reasoning: result.reasoning,
          metadata: result.metadata,
        },
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        taskId: task.id,
        agentId: task.agentId,
        result: {
          text: "",
          metadata: { error: String(error) },
        },
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
      };
    }
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      // Note: We can't actually cancel a running promise, but we can mark it
      // The actual cancellation would need to be handled at the agent level
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Get active task count
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }
}

/**
 * Collaborative Planner
 * Helps agents plan together
 */
export class CollaborativePlanner {
  private space: Space;
  private collaborationManager: AgentCollaborationManager;

  constructor(space: Space, collaborationManager: AgentCollaborationManager) {
    this.space = space;
    this.collaborationManager = collaborationManager;
  }

  /**
   * Create a collaborative plan with multiple agents
   */
  async createCollaborativePlan(
    goal: string,
    agentIds: string[]
  ): Promise<{ plan: any; agentAssignments: Map<string, string[]> }> {
    // Get shared context
    const context = this.collaborationManager.getContext();

    // Create planning tasks for each agent
    const planningTasks: ParallelTask[] = agentIds.map((agentId, index) => ({
      id: `plan-${agentId}-${Date.now()}`,
      agentId,
      messages: [
        {
          role: "user",
          content:
            `We need to create a collaborative plan for: ${goal}\n\n` +
            `Shared context: ${JSON.stringify(context.data, null, 2)}\n\n` +
            `You are one of ${agentIds.length} agents working together. ` +
            `Propose your part of the plan and identify dependencies on other agents.`,
        },
      ],
      priority: agentIds.length - index, // First agent gets highest priority
      metadata: {
        planningSession: true,
        goal,
        otherAgents: agentIds.filter((id) => id !== agentId),
      },
    }));

    // Execute planning in parallel
    const executionEngine = new ParallelExecutionEngine(this.space);
    const results = await executionEngine.executeParallel(planningTasks);

    // Aggregate plans
    const agentPlans = new Map<string, any>();
    for (const result of results) {
      if (!result.error) {
        agentPlans.set(result.agentId, result.result);
      }
    }

    // Create unified plan
    const plan = this.mergePlans(agentPlans, goal);
    const agentAssignments = this.assignTasks(plan, agentIds);

    return { plan, agentAssignments };
  }

  /**
   * Merge multiple agent plans into one
   */
  private mergePlans(agentPlans: Map<string, any>, goal: string): any {
    // Simple merge strategy - in a real implementation, this would be more sophisticated
    const tasks: any[] = [];
    let taskId = 1;

    for (const [agentId, plan] of agentPlans.entries()) {
      if (plan.text) {
        // Extract tasks from plan text (simplified)
        const lines = plan.text
          .split("\n")
          .filter(
            (line: string) =>
              line.trim().startsWith("-") || line.trim().match(/^\d+\./)
          );

        for (const line of lines) {
          tasks.push({
            id: `task-${taskId++}`,
            description: line.replace(/^[-•\d.]+\s*/, "").trim(),
            assignedAgent: agentId,
            status: "pending",
          });
        }
      }
    }

    return {
      goal,
      tasks,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Assign tasks to agents
   */
  private assignTasks(plan: any, agentIds: string[]): Map<string, string[]> {
    const assignments = new Map<string, string[]>();

    for (const agentId of agentIds) {
      assignments.set(agentId, []);
    }

    for (const task of plan.tasks) {
      const agentId = task.assignedAgent || agentIds[0];
      const tasks = assignments.get(agentId) || [];
      tasks.push(task.id);
      assignments.set(agentId, tasks);
    }

    return assignments;
  }
}
