/**
 * Viber Server - Command Center for Viber Daemons
 *
 * This module manages WebSocket connections from viber daemons.
 * The docs site acts as a "command center" that vibers connect to.
 *
 * Architecture:
 *   viber daemon → outbound WSS → this server
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";

// ==================== Types ====================

export interface ConnectedViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  connectedAt: Date;
  ws: WebSocket;
}

export interface ViberTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error";
  createdAt: Date;
  result?: any;
  error?: string;
}

// Messages from viber to server
export type ViberToServerMessage =
  | { type: "connected"; viber: Omit<ConnectedViber, "ws" | "connectedAt"> }
  | { type: "task:started"; taskId: string; spaceId: string }
  | { type: "task:progress"; taskId: string; event: any }
  | { type: "task:completed"; taskId: string; result: any }
  | { type: "task:error"; taskId: string; error: string }
  | { type: "heartbeat"; status: any }
  | { type: "pong" };

// Messages from server to viber
export type ServerToViberMessage =
  | { type: "task:submit"; taskId: string; goal: string; options?: any }
  | { type: "task:stop"; taskId: string }
  | { type: "task:message"; taskId: string; message: string }
  | { type: "ping" }
  | { type: "config:update"; config: any };

// ==================== Viber Server ====================

export class ViberServer {
  private wss: WebSocketServer | null = null;
  private vibers: Map<string, ConnectedViber> = new Map();
  private tasks: Map<string, ViberTask> = new Map();
  private taskCallbacks: Map<string, {
    onProgress?: (event: any) => void;
    onComplete?: (result: any) => void;
    onError?: (error: string) => void;
  }> = new Map();

  /**
   * Initialize WebSocket server on existing HTTP server
   */
  init(server: any, path: string = "/vibers/ws"): void {
    this.wss = new WebSocketServer({
      server,
      path,
    });

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));

    console.log(`[ViberServer] WebSocket server initialized at ${path}`);
  }

  /**
   * Handle new viber connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const viberId = req.headers["x-viber-id"] as string || `viber-${Date.now()}`;
    const token = req.headers["authorization"]?.replace("Bearer ", "");

    console.log(`[ViberServer] Viber connecting: ${viberId}`);

    // Basic token validation (placeholder)
    if (!this.validateToken(token)) {
      ws.close(4001, "Unauthorized");
      return;
    }

    ws.on("message", (data) => this.handleMessage(viberId, ws, data));
    ws.on("close", () => this.handleDisconnect(viberId));
    ws.on("error", (err) => console.error(`[ViberServer] Viber ${viberId} error:`, err));
  }

  /**
   * Validate viber token (placeholder - implement your auth)
   */
  private validateToken(token: string | undefined): boolean {
    // For playground, accept any token
    return true;
  }

  /**
   * Handle message from viber
   */
  private handleMessage(viberId: string, ws: WebSocket, data: any): void {
    try {
      const message = JSON.parse(data.toString()) as ViberToServerMessage;

      switch (message.type) {
        case "connected":
          this.vibers.set(viberId, {
            ...message.viber,
            id: viberId,
            connectedAt: new Date(),
            ws,
          });
          console.log(`[ViberServer] Viber registered: ${message.viber.name}`);
          break;

        case "task:started":
          const startedTask = this.tasks.get(message.taskId);
          if (startedTask) {
            startedTask.status = "running";
          }
          console.log(`[ViberServer] Task started: ${message.taskId}`);
          break;

        case "task:progress":
          const callbacks = this.taskCallbacks.get(message.taskId);
          if (callbacks?.onProgress) {
            callbacks.onProgress(message.event);
          }
          break;

        case "task:completed":
          const completedTask = this.tasks.get(message.taskId);
          if (completedTask) {
            completedTask.status = "completed";
            completedTask.result = message.result;
          }
          const completeCallbacks = this.taskCallbacks.get(message.taskId);
          if (completeCallbacks?.onComplete) {
            completeCallbacks.onComplete(message.result);
          }
          this.taskCallbacks.delete(message.taskId);
          console.log(`[ViberServer] Task completed: ${message.taskId}`);
          break;

        case "task:error":
          const errorTask = this.tasks.get(message.taskId);
          if (errorTask) {
            errorTask.status = "error";
            errorTask.error = message.error;
          }
          const errorCallbacks = this.taskCallbacks.get(message.taskId);
          if (errorCallbacks?.onError) {
            errorCallbacks.onError(message.error);
          }
          this.taskCallbacks.delete(message.taskId);
          console.error(`[ViberServer] Task error: ${message.taskId}`, message.error);
          break;

        case "heartbeat":
          // Update viber status
          break;

        case "pong":
          // Keep-alive response
          break;
      }
    } catch (error) {
      console.error(`[ViberServer] Failed to parse message from ${viberId}:`, error);
    }
  }

  /**
   * Handle viber disconnect
   */
  private handleDisconnect(viberId: string): void {
    const viber = this.vibers.get(viberId);
    if (viber) {
      console.log(`[ViberServer] Viber disconnected: ${viber.name}`);
      this.vibers.delete(viberId);
    }
  }

  // ==================== Public API ====================

  /**
   * Get list of connected vibers
   */
  getVibers(): Array<Omit<ConnectedViber, "ws">> {
    return Array.from(this.vibers.values()).map(({ ws, ...rest }) => rest);
  }

  /**
   * Check if any viber is connected
   */
  hasVibers(): boolean {
    return this.vibers.size > 0;
  }

  /**
   * Submit a task to a viber
   */
  async submitTask(
    goal: string,
    options?: {
      viberId?: string;
      onProgress?: (event: any) => void;
      onComplete?: (result: any) => void;
      onError?: (error: string) => void;
    }
  ): Promise<string> {
    // Get target viber
    let viber: ConnectedViber | undefined;

    if (options?.viberId) {
      viber = this.vibers.get(options.viberId);
    } else {
      // Use first available viber
      viber = this.vibers.values().next().value;
    }

    if (!viber) {
      throw new Error("No viber connected");
    }

    // Create task
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task: ViberTask = {
      id: taskId,
      viberId: viber.id,
      goal,
      status: "pending",
      createdAt: new Date(),
    };

    this.tasks.set(taskId, task);

    // Store callbacks
    if (options?.onProgress || options?.onComplete || options?.onError) {
      this.taskCallbacks.set(taskId, {
        onProgress: options.onProgress,
        onComplete: options.onComplete,
        onError: options.onError,
      });
    }

    // Send to viber
    const message: ServerToViberMessage = {
      type: "task:submit",
      taskId,
      goal,
    };

    viber.ws.send(JSON.stringify(message));

    console.log(`[ViberServer] Task submitted to ${viber.name}: ${taskId}`);

    return taskId;
  }

  /**
   * Stop a running task
   */
  stopTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const viber = this.vibers.get(task.viberId);
    if (!viber) return;

    const message: ServerToViberMessage = {
      type: "task:stop",
      taskId,
    };

    viber.ws.send(JSON.stringify(message));
  }

  /**
   * Get task status
   */
  getTask(taskId: string): ViberTask | undefined {
    return this.tasks.get(taskId);
  }
}

// Singleton instance
export const viberServer = new ViberServer();
