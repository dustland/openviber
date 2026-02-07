/**
 * Hub Server - Central coordinator for viber daemons
 *
 * The hub accepts WebSocket connections from viber daemons and provides
 * a REST API for the Viber Board to manage them.
 *
 * REST API (for Viber Board):
 *   GET  /health           - Health check
 *   GET  /api/vibers       - List connected vibers
 *   POST /api/vibers       - Submit task to a viber
 *   GET  /api/tasks        - List all tasks
 *   GET  /api/tasks/:id    - Get task status
 *   POST /api/tasks/:id/stop - Stop a task
 *
 * WebSocket (for viber daemons):
 *   ws://localhost:6007/ws - Viber daemon connection endpoint
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";

export interface HubConfig {
  port: number;
}

interface ConnectedViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  skills?: { id: string; name: string; description: string }[];
  ws: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  runningTasks: string[];
}

interface TaskEvent {
  at: string;
  event: any;
}

interface TaskProgressEnvelope {
  eventId: string;
  sequence: number;
  taskId: string;
  conversationId: string;
  createdAt: string;
  model?: string;
  event: {
    kind?: string;
    delta?: string;
    [key: string]: unknown;
  };
}

interface Task {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  events: TaskEvent[];
  partialText?: string;
}

export class HubServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private vibers: Map<string, ConnectedViber> = new Map();
  private tasks: Map<string, Task> = new Map();
  // SSE stream subscribers per task: responses waiting for stream chunks
  private streamSubscribers: Map<string, { res: ServerResponse; buffer: string[] }[]> = new Map();

  constructor(private config: HubConfig) { }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleHttp(req, res));

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`[Hub] Port ${this.config.port} is already in use.`);
          console.error(
            `[Hub] Kill the existing process with: lsof -ti :${this.config.port} | xargs kill`
          );
          reject(err);
        } else {
          reject(err);
        }
      });

      this.wss = new WebSocketServer({ noServer: true });

      this.server.on("upgrade", (request, socket, head) => {
        if (request.url === "/ws") {
          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            this.wss!.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      });

      this.wss.on("connection", (ws, req) => {
        this.handleViberConnection(ws, req);
      });

      this.server.listen(this.config.port, () => {
        console.log(`[Hub] Server listening on port ${this.config.port}`);
        console.log(`[Hub] REST API: http://localhost:${this.config.port}`);
        console.log(`[Hub] WebSocket: ws://localhost:${this.config.port}/ws`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Close all viber connections
    for (const viber of this.vibers.values()) {
      viber.ws.close();
    }
    this.vibers.clear();

    return new Promise((resolve) => {
      // Close WebSocket server first
      if (this.wss) {
        this.wss.close(() => {
          // Then close HTTP server
          if (this.server) {
            this.server.close(() => {
              console.log("[Hub] Server stopped");
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else if (this.server) {
        this.server.close(() => {
          console.log("[Hub] Server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // ==================== HTTP Handler ====================

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || "/", `http://localhost:${this.config.port}`);
    const method = req.method || "GET";

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route handling
    if (url.pathname === "/health" && method === "GET") {
      this.handleHealth(res);
    } else if (url.pathname === "/api/vibers" && method === "GET") {
      this.handleListVibers(res);
    } else if (url.pathname === "/api/vibers" && method === "POST") {
      this.handleSubmitTask(req, res);
    } else if (url.pathname === "/api/tasks" && method === "GET") {
      this.handleListTasks(res);
    } else if (
      url.pathname.match(/^\/api\/tasks\/[^/]+$/) &&
      method === "GET"
    ) {
      const taskId = url.pathname.split("/").pop()!;
      this.handleGetTask(taskId, res);
    } else if (
      url.pathname.match(/^\/api\/tasks\/[^/]+\/stop$/) &&
      method === "POST"
    ) {
      const taskId = url.pathname.split("/")[3];
      this.handleStopTask(taskId, res);
    } else if (
      url.pathname.match(/^\/api\/tasks\/[^/]+\/stream$/) &&
      method === "GET"
    ) {
      const taskId = url.pathname.split("/")[3];
      this.handleStreamTask(taskId, req, res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }

  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        vibers: this.vibers.size,
        tasks: this.tasks.size,
      })
    );
  }

  private handleListVibers(res: ServerResponse): void {
    const vibers = Array.from(this.vibers.values()).map((v) => ({
      id: v.id,
      name: v.name,
      version: v.version,
      platform: v.platform,
      capabilities: v.capabilities,
      skills: v.skills,
      connectedAt: v.connectedAt.toISOString(),
      lastHeartbeat: v.lastHeartbeat.toISOString(),
      runningTasks: v.runningTasks,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: true, vibers }));
  }

  private handleSubmitTask(req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { goal, viberId, messages } = JSON.parse(body);

        if (!goal) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing goal" }));
          return;
        }

        // Find viber (use specified or first available)
        let viber: ConnectedViber | undefined;
        if (viberId) {
          viber = this.vibers.get(viberId);
        } else {
          viber = this.vibers.values().next().value;
        }

        if (!viber) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No viber available" }));
          return;
        }

        // Create task
        const taskId = `task-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const task: Task = {
          id: taskId,
          viberId: viber.id,
          goal,
          status: "pending",
          createdAt: new Date(),
          events: [],
          partialText: "",
        };
        this.tasks.set(taskId, task);

        // Send to viber
        viber.ws.send(
          JSON.stringify({
            type: "task:submit",
            taskId,
            goal,
            messages,
          })
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ taskId, viberId: viber.id }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request body" }));
      }
    });
  }

  private handleListTasks(res: ServerResponse): void {
    const tasks = Array.from(this.tasks.values()).map((t) => ({
      id: t.id,
      viberId: t.viberId,
      goal: t.goal,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString(),
      eventCount: t.events.length,
      partialText: t.partialText,
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
    res.end(
      JSON.stringify({
        id: task.id,
        viberId: task.viberId,
        goal: task.goal,
        status: task.status,
        result: task.result,
        error: task.error,
        createdAt: task.createdAt.toISOString(),
        completedAt: task.completedAt?.toISOString(),
        events: task.events,
        eventCount: task.events.length,
        partialText: task.partialText,
      })
    );
  }

  private handleStopTask(taskId: string, res: ServerResponse): void {
    const task = this.tasks.get(taskId);

    if (!task) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    const viber = this.vibers.get(task.viberId);
    if (viber) {
      viber.ws.send(JSON.stringify({ type: "task:stop", taskId }));
    }

    task.status = "stopped";
    task.completedAt = new Date();

    // Close any SSE stream subscribers for this task
    this.closeStreamSubscribers(taskId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }

  /**
   * GET /api/tasks/:id/stream - SSE endpoint for AI SDK data stream.
   * Holds the response open and pipes task:stream-chunk data from the daemon.
   */
  private handleStreamTask(taskId: string, req: IncomingMessage, res: ServerResponse): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    // If task is already completed/error, return immediately with any buffered data
    if (task.status === "completed" || task.status === "error" || task.status === "stopped") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "x-vercel-ai-ui-message-stream",
      });
      // Write any buffered stream data
      const subscribers = this.streamSubscribers.get(taskId);
      if (subscribers && subscribers.length > 0) {
        const buffers = subscribers[0]?.buffer;
        if (buffers) {
          for (const chunk of buffers) {
            res.write(chunk);
          }
        }
      }
      res.end();
      return;
    }

    // Set SSE headers with AI SDK stream protocol marker
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "x-vercel-ai-ui-message-stream": "v1",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "x-vercel-ai-ui-message-stream",
    });

    // Register as a stream subscriber
    if (!this.streamSubscribers.has(taskId)) {
      this.streamSubscribers.set(taskId, []);
    }
    const subs = this.streamSubscribers.get(taskId)!;

    // If there's buffered data from chunks that arrived before this SSE connected, replay it
    const existing = subs.find(s => s.buffer.length > 0);
    const buffered = existing ? [...existing.buffer] : [];
    const subscriber = { res, buffer: buffered };
    subs.push(subscriber);

    // Write buffered chunks
    for (const chunk of buffered) {
      res.write(chunk);
    }

    // Handle client disconnect
    req.on("close", () => {
      const idx = subs.indexOf(subscriber);
      if (idx >= 0) subs.splice(idx, 1);
      if (subs.length === 0) this.streamSubscribers.delete(taskId);
    });
  }

  // ==================== WebSocket Handler ====================

  private handleViberConnection(ws: WebSocket, req: IncomingMessage): void {
    const viberId = req.headers["x-viber-id"] as string;
    console.log(`[Hub] Viber connecting: ${viberId || "unknown"}`);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleViberMessage(ws, msg);
      } catch (error) {
        console.error("[Hub] Failed to parse viber message:", error);
      }
    });

    ws.on("close", () => {
      // Find and remove viber
      for (const [id, viber] of this.vibers) {
        if (viber.ws === ws) {
          console.log(`[Hub] Viber disconnected: ${id}`);
          this.vibers.delete(id);
          break;
        }
      }
    });

    ws.on("error", (error) => {
      console.error("[Hub] Viber WebSocket error:", error);
    });
  }

  private handleViberMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case "connected":
        this.handleViberConnected(ws, msg.viber);
        break;

      case "task:started":
        this.handleTaskStarted(msg.taskId);
        break;

      case "task:progress":
        this.handleTaskProgress(msg.taskId, msg.event);
        break;

      case "task:stream-chunk":
        this.handleTaskStreamChunk(msg.taskId, msg.chunk);
        break;

      case "task:completed":
        this.handleTaskCompleted(msg.taskId, msg.result);
        break;

      case "task:error":
        this.handleTaskError(msg.taskId, msg.error);
        break;

      case "heartbeat":
        this.handleHeartbeat(ws);
        break;

      case "pong":
        // Response to ping, update lastHeartbeat
        this.handleHeartbeat(ws);
        break;

      default:
        console.log(`[Hub] Unknown message type: ${msg.type}`);
    }
  }

  private handleViberConnected(ws: WebSocket, viber: any): void {
    console.log(`[Hub] Viber registered: ${viber.id} (${viber.name})`);

    this.vibers.set(viber.id, {
      id: viber.id,
      name: viber.name,
      version: viber.version,
      platform: viber.platform,
      capabilities: viber.capabilities || [],
      skills: viber.skills,
      ws,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      runningTasks: viber.runningTasks || [],
    });
  }

  private handleTaskStarted(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "running";
      console.log(`[Hub] Task started: ${taskId}`);
    }
  }

  private handleTaskCompleted(taskId: string, result: any): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "completed";
      task.result = result;
      task.completedAt = new Date();
      if (typeof result?.text === "string") {
        task.partialText = result.text;
      }
      console.log(`[Hub] Task completed: ${taskId}`);

      // Close SSE stream subscribers
      this.closeStreamSubscribers(taskId);
    }
  }

  private handleTaskProgress(taskId: string, event: any): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const envelope = this.normalizeTaskProgressEvent(taskId, event);

    task.events.push({ at: envelope.createdAt, event: envelope });
    if (task.events.length > 500) {
      task.events.shift();
    }

    if (
      envelope.event?.kind === "text-delta" &&
      typeof envelope.event?.delta === "string"
    ) {
      task.partialText = (task.partialText || "") + envelope.event.delta;
      if (task.partialText.length > 20000) {
        task.partialText = task.partialText.slice(-20000);
      }
    }
  }

  private normalizeTaskProgressEvent(
    taskId: string,
    payload: any
  ): TaskProgressEnvelope {
    const now = new Date().toISOString();
    if (
      payload &&
      typeof payload === "object" &&
      "eventId" in payload &&
      "sequence" in payload &&
      "event" in payload
    ) {
      return payload as TaskProgressEnvelope;
    }

    return {
      eventId: `${taskId}-legacy-${Date.now()}`,
      sequence: 0,
      taskId,
      conversationId: taskId,
      createdAt: now,
      event: payload || {},
    };
  }

  private handleTaskError(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "error";
      task.error = error;
      task.completedAt = new Date();
      console.log(`[Hub] Task error: ${taskId} - ${error}`);

      // Close SSE stream subscribers
      this.closeStreamSubscribers(taskId);
    }
  }

  /**
   * Handle task:stream-chunk — pipe raw AI SDK SSE bytes to SSE subscribers.
   */
  private handleTaskStreamChunk(taskId: string, chunk: string): void {
    if (!this.streamSubscribers.has(taskId)) {
      // No subscribers yet; buffer the chunk on first subscriber slot
      this.streamSubscribers.set(taskId, [{ res: null as any, buffer: [chunk] }]);
      return;
    }

    const subs = this.streamSubscribers.get(taskId)!;
    for (const sub of subs) {
      sub.buffer.push(chunk);
      if (sub.res && !sub.res.writableEnded) {
        sub.res.write(chunk);
      }
    }
  }

  /**
   * Close all SSE stream subscribers for a task.
   */
  private closeStreamSubscribers(taskId: string): void {
    const subs = this.streamSubscribers.get(taskId);
    if (subs) {
      for (const sub of subs) {
        if (sub.res && !sub.res.writableEnded) {
          sub.res.end();
        }
      }
      this.streamSubscribers.delete(taskId);
    }
  }

  private handleHeartbeat(ws: WebSocket): void {
    for (const viber of this.vibers.values()) {
      if (viber.ws === ws) {
        viber.lastHeartbeat = new Date();
        break;
      }
    }
  }
}
