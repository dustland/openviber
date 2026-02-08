/**
 * Hub Server - Central coordinator for viber nodes
 *
 * The hub accepts WebSocket connections from node daemons and provides
 * a REST API for the Viber Board to manage them.
 *
 * REST API (for Viber Board):
 *   GET  /health              - Health check
 *   GET  /api/nodes           - List connected nodes
 *   GET  /api/vibers          - List all vibers (sessions)
 *   POST /api/vibers          - Create a new viber on a node
 *   GET  /api/vibers/:id      - Get viber details
 *   POST /api/vibers/:id/stop - Stop a viber
 *   GET  /api/vibers/:id/stream - SSE stream for viber output
 *
 * WebSocket (for node daemons):
 *   ws://localhost:6007/ws - Node daemon connection endpoint
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";

export interface HubConfig {
  port: number;
}

interface ConnectedNode {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  skills?: { id: string; name: string; description: string }[];
  ws: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  runningVibers: string[];
}

interface ViberEvent {
  at: string;
  event: any;
}

interface ViberProgressEnvelope {
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

interface Viber {
  id: string;
  nodeId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  events: ViberEvent[];
  partialText?: string;
}

export class HubServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private nodes: Map<string, ConnectedNode> = new Map();
  private vibers: Map<string, Viber> = new Map();
  // SSE stream subscribers per viber: responses waiting for stream chunks
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
        this.handleNodeConnection(ws, req);
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
    // Close all node connections
    for (const node of this.nodes.values()) {
      node.ws.close();
    }
    this.nodes.clear();

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
    } else if (url.pathname === "/api/nodes" && method === "GET") {
      this.handleListNodes(res);
    } else if (url.pathname === "/api/vibers" && method === "GET") {
      this.handleListVibers(res);
    } else if (url.pathname === "/api/vibers" && method === "POST") {
      this.handleCreateViber(req, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+$/) &&
      method === "GET"
    ) {
      const viberId = url.pathname.split("/").pop()!;
      this.handleGetViber(viberId, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+\/message$/) &&
      method === "POST"
    ) {
      const viberId = url.pathname.split("/")[3];
      this.handleSendMessage(viberId, req, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+\/stop$/) &&
      method === "POST"
    ) {
      const viberId = url.pathname.split("/")[3];
      this.handleStopViber(viberId, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+\/stream$/) &&
      method === "GET"
    ) {
      const viberId = url.pathname.split("/")[3];
      this.handleStreamViber(viberId, req, res);
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
        nodes: this.nodes.size,
        vibers: this.vibers.size,
      })
    );
  }

  private handleListNodes(res: ServerResponse): void {
    const nodes = Array.from(this.nodes.values()).map((n) => ({
      id: n.id,
      name: n.name,
      version: n.version,
      platform: n.platform,
      capabilities: n.capabilities,
      skills: n.skills,
      connectedAt: n.connectedAt.toISOString(),
      lastHeartbeat: n.lastHeartbeat.toISOString(),
      runningVibers: n.runningVibers,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: true, nodes }));
  }

  private handleListVibers(res: ServerResponse): void {
    const vibers = Array.from(this.vibers.values()).map((v) => ({
      id: v.id,
      nodeId: v.nodeId,
      goal: v.goal,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
      completedAt: v.completedAt?.toISOString(),
      eventCount: v.events.length,
      partialText: v.partialText,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ vibers }));
  }

  private handleCreateViber(req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { goal, nodeId, messages, environment } = JSON.parse(body);

        if (!goal) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing goal" }));
          return;
        }

        // Find node (use specified or first available)
        let node: ConnectedNode | undefined;
        if (nodeId) {
          node = this.nodes.get(nodeId);
        } else {
          node = this.nodes.values().next().value;
        }

        if (!node) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No node available" }));
          return;
        }

        // Create viber
        const viberId = `viber-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const viber: Viber = {
          id: viberId,
          nodeId: node.id,
          goal,
          status: "pending",
          createdAt: new Date(),
          events: [],
          partialText: "",
        };
        this.vibers.set(viberId, viber);

        // Tell the node daemon to prepare and run this viber
        node.ws.send(
          JSON.stringify({
            type: "viber:create",
            viberId,
            goal,
            messages,
            environment,
          })
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ viberId, nodeId: node.id }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request body" }));
      }
    });
  }

  private handleGetViber(viberId: string, res: ServerResponse): void {
    const viber = this.vibers.get(viberId);

    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found" }));
      return;
    }

    // Include node info for connectivity
    const node = this.nodes.get(viber.nodeId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: viber.id,
        nodeId: viber.nodeId,
        nodeName: node?.name ?? viber.nodeId,
        goal: viber.goal,
        status: viber.status,
        result: viber.result,
        error: viber.error,
        createdAt: viber.createdAt.toISOString(),
        completedAt: viber.completedAt?.toISOString(),
        events: viber.events,
        eventCount: viber.events.length,
        partialText: viber.partialText,
        isNodeConnected: !!node,
      })
    );
  }

  /**
   * POST /api/vibers/:id/message - Send a message to an existing viber.
   * Reuses the viber ID, resets its status, and sends the messages to the node.
   */
  private handleSendMessage(viberId: string, req: IncomingMessage, res: ServerResponse): void {
    const viber = this.vibers.get(viberId);
    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found" }));
      return;
    }

    const node = this.nodes.get(viber.nodeId);
    if (!node) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Node not connected" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { messages, goal, environment } = JSON.parse(body);

        // Reset viber state for the new message
        viber.status = "pending";
        viber.completedAt = undefined;
        viber.result = undefined;
        viber.error = undefined;
        viber.events = [];
        viber.partialText = "";
        if (goal) viber.goal = goal;

        // Close old stream subscribers so the new request gets a fresh stream
        this.closeStreamSubscribers(viberId);

        // Send message to the node daemon
        node.ws.send(
          JSON.stringify({
            type: "viber:create",
            viberId,
            goal: goal || viber.goal,
            messages,
            environment,
          })
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ viberId, nodeId: node.id }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request body" }));
      }
    });
  }

  private handleStopViber(viberId: string, res: ServerResponse): void {
    const viber = this.vibers.get(viberId);

    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found" }));
      return;
    }

    const node = this.nodes.get(viber.nodeId);
    if (node) {
      node.ws.send(JSON.stringify({ type: "viber:stop", viberId }));
    }

    viber.status = "stopped";
    viber.completedAt = new Date();

    // Close any SSE stream subscribers for this viber
    this.closeStreamSubscribers(viberId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }

  /**
   * GET /api/vibers/:id/stream - SSE endpoint for AI SDK data stream.
   * Holds the response open and pipes viber stream chunks from the daemon.
   */
  private handleStreamViber(viberId: string, req: IncomingMessage, res: ServerResponse): void {
    const viber = this.vibers.get(viberId);
    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found" }));
      return;
    }

    // If viber is already completed/error, return immediately with any buffered data
    if (viber.status === "completed" || viber.status === "error" || viber.status === "stopped") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "x-vercel-ai-ui-message-stream",
      });
      // Write any buffered stream data
      const subscribers = this.streamSubscribers.get(viberId);
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
    if (!this.streamSubscribers.has(viberId)) {
      this.streamSubscribers.set(viberId, []);
    }
    const subs = this.streamSubscribers.get(viberId)!;

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
      if (subs.length === 0) this.streamSubscribers.delete(viberId);
    });
  }

  // ==================== WebSocket Handler ====================

  private handleNodeConnection(ws: WebSocket, req: IncomingMessage): void {
    const nodeId = req.headers["x-viber-id"] as string;
    console.log(`[Hub] Node connecting: ${nodeId || "unknown"}`);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleNodeMessage(ws, msg);
      } catch (error) {
        console.error("[Hub] Failed to parse node message:", error);
      }
    });

    ws.on("close", () => {
      // Find and remove node
      for (const [id, node] of this.nodes) {
        if (node.ws === ws) {
          console.log(`[Hub] Node disconnected: ${id}`);
          this.nodes.delete(id);
          break;
        }
      }
    });

    ws.on("error", (error) => {
      console.error("[Hub] Node WebSocket error:", error);
    });
  }

  private handleNodeMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case "connected":
        this.handleNodeConnected(ws, msg.viber);
        break;

      case "viber:started":
      case "task:started":
        this.handleViberStarted(msg.viberId || msg.taskId);
        break;

      case "viber:progress":
      case "task:progress":
        this.handleViberProgress(msg.viberId || msg.taskId, msg.event);
        break;

      case "viber:stream-chunk":
      case "task:stream-chunk":
        this.handleViberStreamChunk(msg.viberId || msg.taskId, msg.chunk);
        break;

      case "viber:completed":
      case "task:completed":
        this.handleViberCompleted(msg.viberId || msg.taskId, msg.result);
        break;

      case "viber:error":
      case "task:error":
        this.handleViberError(msg.viberId || msg.taskId, msg.error);
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

  private handleNodeConnected(ws: WebSocket, nodeInfo: any): void {
    console.log(`[Hub] Node registered: ${nodeInfo.id} (${nodeInfo.name})`);

    this.nodes.set(nodeInfo.id, {
      id: nodeInfo.id,
      name: nodeInfo.name,
      version: nodeInfo.version,
      platform: nodeInfo.platform,
      capabilities: nodeInfo.capabilities || [],
      skills: nodeInfo.skills,
      ws,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      runningVibers: nodeInfo.runningTasks || [],
    });
  }

  private handleViberStarted(viberId: string): void {
    const viber = this.vibers.get(viberId);
    if (viber) {
      viber.status = "running";
      console.log(`[Hub] Viber started: ${viberId}`);
    }
  }

  private handleViberCompleted(viberId: string, result: any): void {
    const viber = this.vibers.get(viberId);
    if (viber) {
      viber.status = "completed";
      viber.result = result;
      viber.completedAt = new Date();
      if (typeof result?.text === "string") {
        viber.partialText = result.text;
      }
      console.log(`[Hub] Viber completed: ${viberId}`);

      // Close SSE stream subscribers
      this.closeStreamSubscribers(viberId);
    }
  }

  private handleViberProgress(viberId: string, event: any): void {
    const viber = this.vibers.get(viberId);
    if (!viber) return;

    const envelope = this.normalizeProgressEvent(viberId, event);

    viber.events.push({ at: envelope.createdAt, event: envelope });
    if (viber.events.length > 500) {
      viber.events.shift();
    }

    if (
      envelope.event?.kind === "text-delta" &&
      typeof envelope.event?.delta === "string"
    ) {
      viber.partialText = (viber.partialText || "") + envelope.event.delta;
      if (viber.partialText.length > 20000) {
        viber.partialText = viber.partialText.slice(-20000);
      }
    }
  }

  private normalizeProgressEvent(
    viberId: string,
    payload: any
  ): ViberProgressEnvelope {
    const now = new Date().toISOString();
    if (
      payload &&
      typeof payload === "object" &&
      "eventId" in payload &&
      "sequence" in payload &&
      "event" in payload
    ) {
      return payload as ViberProgressEnvelope;
    }

    return {
      eventId: `${viberId}-legacy-${Date.now()}`,
      sequence: 0,
      taskId: viberId,
      conversationId: viberId,
      createdAt: now,
      event: payload || {},
    };
  }

  private handleViberError(viberId: string, error: string): void {
    const viber = this.vibers.get(viberId);
    if (viber) {
      viber.status = "error";
      viber.error = error;
      viber.completedAt = new Date();
      console.log(`[Hub] Viber error: ${viberId} - ${error}`);

      // Close SSE stream subscribers
      this.closeStreamSubscribers(viberId);
    }
  }

  /**
   * Handle viber:stream-chunk — pipe raw AI SDK SSE bytes to SSE subscribers.
   */
  private handleViberStreamChunk(viberId: string, chunk: string): void {
    if (!this.streamSubscribers.has(viberId)) {
      // No subscribers yet; buffer the chunk on first subscriber slot
      this.streamSubscribers.set(viberId, [{ res: null as any, buffer: [chunk] }]);
      return;
    }

    const subs = this.streamSubscribers.get(viberId)!;
    for (const sub of subs) {
      sub.buffer.push(chunk);
      if (sub.res && !sub.res.writableEnded) {
        sub.res.write(chunk);
      }
    }
  }

  /**
   * Close all SSE stream subscribers for a viber.
   */
  private closeStreamSubscribers(viberId: string): void {
    const subs = this.streamSubscribers.get(viberId);
    if (subs) {
      for (const sub of subs) {
        if (sub.res && !sub.res.writableEnded) {
          sub.res.end();
        }
      }
      this.streamSubscribers.delete(viberId);
    }
  }

  private handleHeartbeat(ws: WebSocket): void {
    for (const node of this.nodes.values()) {
      if (node.ws === ws) {
        node.lastHeartbeat = new Date();
        break;
      }
    }
  }
}
