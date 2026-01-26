/**
 * ViberController - Daemon controller for outbound connection to command center
 *
 * A Viber is a local agent daemon that connects OUTBOUND to a central command center
 * (Supen). This eliminates the need for public IPs or port forwarding.
 *
 * Features:
 * - Persistent WebSocket connection to command center
 * - Auto-reconnection on disconnect
 * - Heartbeat/health monitoring
 * - Task execution and event streaming
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import { ViberAgent, ViberOptions } from "../core/viber-agent";
import type { AntigravityWindowStatus, AntigravityMonitor } from "./monitor";

// ==================== Types ====================

export interface ViberControllerConfig {
  /** WebSocket URL to connect to (e.g., wss://supen.app/vibers/ws) */
  serverUrl: string;
  /** Authentication token */
  token: string;
  /** Unique identifier for this viber */
  viberId: string;
  /** Human-readable name for this viber */
  viberName?: string;
  /** Milliseconds between reconnection attempts */
  reconnectInterval?: number;
  /** Milliseconds between heartbeat messages */
  heartbeatInterval?: number;
  /** Enable desktop control tools */
  enableDesktop?: boolean;
}

export interface ViberInfo {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  runningTasks: string[];
}

export interface ViberStatus {
  platform: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  runningTasks: number;
  // Antigravity monitor status (optional)
  antigravityWindows?: AntigravityWindowStatus[];
}

// Server -> Viber messages
export type ControllerServerMessage =
  | { type: "task:submit"; taskId: string; goal: string; options?: ViberOptions }
  | { type: "task:stop"; taskId: string }
  | { type: "task:message"; taskId: string; message: string }
  | { type: "ping" }
  | { type: "config:update"; config: Partial<ViberControllerConfig> };

// Viber -> Server messages
export type ControllerClientMessage =
  | { type: "connected"; viber: ViberInfo }
  | { type: "task:started"; taskId: string; spaceId: string }
  | { type: "task:progress"; taskId: string; event: any }
  | { type: "task:completed"; taskId: string; result: any }
  | { type: "task:error"; taskId: string; error: string }
  | { type: "heartbeat"; status: ViberStatus }
  | { type: "pong" };

// ==================== Controller ====================

export class ViberController extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private runningTasks: Map<string, ViberAgent> = new Map();
  private isConnected = false;
  private shouldReconnect = true;
  private monitor: AntigravityMonitor | null = null;

  constructor(private config: ViberControllerConfig) {
    super();
  }

  /**
   * Set the Antigravity monitor for status reporting
   */
  setMonitor(monitor: AntigravityMonitor): void {
    this.monitor = monitor;
  }

  /**
   * Start the viber daemon
   */
  async start(): Promise<void> {
    console.log(`[Viber] Starting viber: ${this.config.viberId}`);
    console.log(`[Viber] Connecting to: ${this.config.serverUrl}`);
    this.shouldReconnect = true;
    await this.connect();
  }

  /**
   * Stop the viber daemon
   */
  async stop(): Promise<void> {
    console.log("[Viber] Stopping viber...");
    this.shouldReconnect = false;

    // Stop all running tasks
    for (const [taskId, agent] of this.runningTasks) {
      agent.stop();
      this.runningTasks.delete(taskId);
    }

    // Clear timers
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.emit("stopped");
  }

  /**
   * Get current connection status
   */
  getStatus(): { connected: boolean; runningTasks: number } {
    return {
      connected: this.isConnected,
      runningTasks: this.runningTasks.size,
    };
  }

  // ==================== Connection Management ====================

  private async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(this.config.serverUrl, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "X-Viber-Id": this.config.viberId,
          "X-Viber-Version": "1.0.0",
        },
      });

      this.ws.on("open", () => this.onConnected());
      this.ws.on("message", (data) => this.onMessage(data));
      this.ws.on("close", () => this.onDisconnected());
      this.ws.on("error", (err) => this.onError(err));
    } catch (error) {
      console.error("[Viber] Connection failed:", error);
      this.scheduleReconnect();
    }
  }

  private onConnected(): void {
    console.log("[Viber] Connected to command center");
    this.isConnected = true;

    // Determine capabilities
    const capabilities = ["file", "search", "web"];
    if (this.config.enableDesktop) {
      capabilities.push("desktop");
    }

    // Send viber info
    this.send({
      type: "connected",
      viber: {
        id: this.config.viberId,
        name: this.config.viberName || this.config.viberId,
        version: "1.0.0",
        platform: process.platform,
        capabilities,
        runningTasks: Array.from(this.runningTasks.keys()),
      },
    });

    // Start heartbeat
    this.startHeartbeat();

    this.emit("connected");
  }

  private onDisconnected(): void {
    console.log("[Viber] Disconnected from command center");
    this.isConnected = false;
    this.stopHeartbeat();

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }

    this.emit("disconnected");
  }

  private onError(error: Error): void {
    console.error("[Viber] WebSocket error:", error.message);
    this.emit("error", error);
  }

  private async onMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as ControllerServerMessage;

      switch (message.type) {
        case "task:submit":
          await this.handleTaskSubmit(message);
          break;

        case "task:stop":
          await this.handleTaskStop(message.taskId);
          break;

        case "task:message":
          await this.handleTaskMessage(message.taskId, message.message);
          break;

        case "ping":
          this.send({ type: "pong" });
          break;

        case "config:update":
          Object.assign(this.config, message.config);
          this.emit("config:update", message.config);
          break;
      }
    } catch (error) {
      console.error("[Viber] Failed to process message:", error);
    }
  }

  // ==================== Task Handling ====================

  private async handleTaskSubmit(message: {
    taskId: string;
    goal: string;
    options?: ViberOptions;
  }): Promise<void> {
    const { taskId, goal, options } = message;

    console.log(`[Viber] Received task: ${taskId}`);
    console.log(`[Viber] Goal: ${goal}`);

    try {
      // Create ViberAgent
      const agent = await ViberAgent.start(goal, {
        model: options?.model,
        ...options,
      });

      this.runningTasks.set(taskId, agent);

      // Notify task started
      this.send({
        type: "task:started",
        taskId,
        spaceId: agent.spaceId,
      });

      // Execute task and stream events
      await this.executeTask(taskId, agent, goal, options);
    } catch (error: any) {
      console.error(`[Viber] Task ${taskId} failed to start:`, error);
      this.send({
        type: "task:error",
        taskId,
        error: error.message,
      });
    }
  }

  private async executeTask(
    taskId: string,
    agent: ViberAgent,
    goal: string,
    options?: ViberOptions
  ): Promise<void> {
    try {
      // Stream text execution
      const result = await agent.streamText({
        messages: [{ role: "user", content: goal }],
        metadata: {
          mode: "agent",
          requestedAgent: options?.singleAgentId || "default",
          taskId,
        },
      });

      // Process stream and send events
      for await (const chunk of result.fullStream) {
        this.send({
          type: "task:progress",
          taskId,
          event: chunk,
        });
      }

      // Get final result
      const finalText = await result.text;

      this.send({
        type: "task:completed",
        taskId,
        result: {
          spaceId: agent.spaceId,
          text: finalText,
          summary: agent.getSummary(),
        },
      });
    } catch (error: any) {
      console.error(`[Viber] Task ${taskId} execution error:`, error);
      this.send({
        type: "task:error",
        taskId,
        error: error.message,
      });
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  private async handleTaskStop(taskId: string): Promise<void> {
    const agent = this.runningTasks.get(taskId);
    if (agent) {
      agent.stop();
      this.runningTasks.delete(taskId);
      console.log(`[Viber] Task stopped: ${taskId}`);
    }
  }

  private async handleTaskMessage(taskId: string, message: string): Promise<void> {
    const agent = this.runningTasks.get(taskId);
    if (agent) {
      agent.addMessage(message);
      console.log(`[Viber] Message added to task: ${taskId}`);
    }
  }

  // ==================== Communication ====================

  private send(message: ControllerClientMessage): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // ==================== Heartbeat ====================

  private startHeartbeat(): void {
    const interval = this.config.heartbeatInterval || 30000;
    this.heartbeatTimer = setInterval(() => {
      const status: ViberStatus = {
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        runningTasks: this.runningTasks.size,
      };

      // Include Antigravity window statuses if monitor is available
      if (this.monitor) {
        status.antigravityWindows = this.monitor.getWindowStatuses();
      }

      this.send({ type: "heartbeat", status });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ==================== Reconnection ====================

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    const interval = this.config.reconnectInterval || 5000;
    console.log(`[Viber] Reconnecting in ${interval}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, interval);
  }
}
