/**
 * Playground Server - Command Center for Viber Daemons
 *
 * A lightweight HTTP + WebSocket server that:
 * - Accepts viber daemon connections at /vibers/ws
 * - Provides REST API for task submission
 * - Can be used as a playground for testing vibers
 *
 * Usage:
 *   viber playground --port 6007
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";

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

export interface PlaygroundTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error";
  createdAt: Date;
  result?: any;
  error?: string;
  events: any[];
}

// Messages from viber to server
type ViberToServerMessage =
  | { type: "connected"; viber: Omit<ConnectedViber, "ws" | "connectedAt"> }
  | { type: "task:started"; taskId: string; spaceId: string }
  | { type: "task:progress"; taskId: string; event: any }
  | { type: "task:completed"; taskId: string; result: any }
  | { type: "task:error"; taskId: string; error: string }
  | { type: "heartbeat"; status: any }
  | { type: "pong" };

// Messages from server to viber
type ServerToViberMessage =
  | { type: "task:submit"; taskId: string; goal: string; options?: any }
  | { type: "task:stop"; taskId: string }
  | { type: "task:message"; taskId: string; message: string }
  | { type: "ping" };

// ==================== Playground Server ====================

export class PlaygroundServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private vibers: Map<string, ConnectedViber> = new Map();
  private tasks: Map<string, PlaygroundTask> = new Map();
  private port: number = 6007;

  /**
   * Start the playground server
   */
  async start(port: number = 6007): Promise<void> {
    this.port = port;

    // Create HTTP server
    this.server = createServer((req, res) => this.handleHttp(req, res));

    // Create WebSocket server
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws, req) => this.handleViberConnection(ws, req));

    // Handle upgrade requests
    this.server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "", `http://localhost:${port}`);

      if (url.pathname === "/vibers/ws") {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // Start listening
    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                 VIBER PLAYGROUND SERVER                    ║
╠═══════════════════════════════════════════════════════════╣
║  Port:          ${port.toString().padEnd(41)}║
║  WebSocket:     ws://localhost:${port}/vibers/ws${" ".repeat(Math.max(0, 17 - port.toString().length))}║
║  API:           http://localhost:${port}/api${" ".repeat(Math.max(0, 19 - port.toString().length))}║
╚═══════════════════════════════════════════════════════════╝

Waiting for vibers to connect...
`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Close all viber connections
    for (const viber of this.vibers.values()) {
      viber.ws.close();
    }
    this.vibers.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => resolve());
        this.server = null;
      });
    }
  }

  // ==================== HTTP Handler ====================

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || "", `http://localhost:${this.port}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route requests
    if (url.pathname === "/api/vibers" && req.method === "GET") {
      this.handleGetVibers(res);
    } else if (url.pathname === "/api/vibers" && req.method === "POST") {
      this.handleSubmitTask(req, res);
    } else if (url.pathname === "/api/tasks" && req.method === "GET") {
      this.handleGetTasks(res);
    } else if (url.pathname.startsWith("/api/tasks/") && req.method === "GET") {
      const taskId = url.pathname.split("/")[3];
      this.handleGetTask(taskId, res);
    } else if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", vibers: this.vibers.size }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }

  private handleGetVibers(res: ServerResponse): void {
    const vibers = Array.from(this.vibers.values()).map(({ ws, ...rest }) => rest);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: vibers.length > 0, vibers }));
  }

  private handleSubmitTask(req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { goal, viberId } = JSON.parse(body);

        if (!goal) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "goal is required" }));
          return;
        }

        if (this.vibers.size === 0) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No viber connected" }));
          return;
        }

        const taskId = await this.submitTask(goal, viberId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ taskId, status: "submitted" }));
      } catch (error: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  private handleGetTasks(res: ServerResponse): void {
    const tasks = Array.from(this.tasks.values()).map(({ events, ...rest }) => ({
      ...rest,
      eventCount: events.length,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tasks }));
  }

  private handleGetTask(taskId: string, res: ServerResponse): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(task));
  }

  // ==================== WebSocket Handler ====================

  private handleViberConnection(ws: WebSocket, req: IncomingMessage): void {
    const viberId = req.headers["x-viber-id"] as string || `viber-${Date.now()}`;
    console.log(`[Playground] Viber connecting: ${viberId}`);

    ws.on("message", (data) => this.handleViberMessage(viberId, ws, data));
    ws.on("close", () => this.handleViberDisconnect(viberId));
    ws.on("error", (err) => console.error(`[Playground] Viber ${viberId} error:`, err));
  }

  private handleViberMessage(viberId: string, ws: WebSocket, data: any): void {
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
          console.log(`[Playground] Viber registered: ${message.viber.name}`);
          break;

        case "task:started":
          const startedTask = this.tasks.get(message.taskId);
          if (startedTask) {
            startedTask.status = "running";
          }
          console.log(`[Playground] Task started: ${message.taskId}`);
          break;

        case "task:progress":
          const progressTask = this.tasks.get(message.taskId);
          if (progressTask) {
            progressTask.events.push(message.event);
          }
          break;

        case "task:completed":
          const completedTask = this.tasks.get(message.taskId);
          if (completedTask) {
            completedTask.status = "completed";
            completedTask.result = message.result;
          }
          console.log(`[Playground] Task completed: ${message.taskId}`);
          break;

        case "task:error":
          const errorTask = this.tasks.get(message.taskId);
          if (errorTask) {
            errorTask.status = "error";
            errorTask.error = message.error;
          }
          console.error(`[Playground] Task error: ${message.taskId}`, message.error);
          break;
      }
    } catch (error) {
      console.error(`[Playground] Failed to parse message:`, error);
    }
  }

  private handleViberDisconnect(viberId: string): void {
    const viber = this.vibers.get(viberId);
    if (viber) {
      console.log(`[Playground] Viber disconnected: ${viber.name}`);
      this.vibers.delete(viberId);
    }
  }

  // ==================== Task Management ====================

  private async submitTask(goal: string, viberId?: string): Promise<string> {
    // Get target viber
    let viber: ConnectedViber | undefined;

    if (viberId) {
      viber = this.vibers.get(viberId);
    } else {
      viber = this.vibers.values().next().value;
    }

    if (!viber) {
      throw new Error("No viber connected");
    }

    // Create task
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task: PlaygroundTask = {
      id: taskId,
      viberId: viber.id,
      goal,
      status: "pending",
      createdAt: new Date(),
      events: [],
    };

    this.tasks.set(taskId, task);

    // Send to viber
    const message: ServerToViberMessage = {
      type: "task:submit",
      taskId,
      goal,
    };

    viber.ws.send(JSON.stringify(message));
    console.log(`[Playground] Task submitted to ${viber.name}: ${taskId}`);

    return taskId;
  }
}

// Export singleton
export const playgroundServer = new PlaygroundServer();
