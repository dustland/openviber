/**
 * Gateway Server - Central coordinator for viber nodes
 *
 * The gateway accepts WebSocket connections from node daemons and provides
 * a REST API for the Viber Board web app to manage them.
 *
 * REST API (for Viber Board):
 *   GET  /health              - Health check
 *   GET  /api/nodes           - List connected nodes
 *   GET  /api/events          - Unified event stream (activity + system)
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
import type {
  MachineResourceStatus,
  ViberRunningStatus,
  NodeObservabilityStatus,
} from "./node-status";

export interface GatewayConfig {
  port: number;
}

/** @deprecated Use GatewayConfig instead */
export type BoardConfig = GatewayConfig;

/** @deprecated Use GatewayConfig instead */
export type HubConfig = GatewayConfig;

interface NodeJobEntry {
  name: string;
  schedule: string;
  prompt: string;
  description?: string;
  model?: string;
  nodeId?: string;
}

interface ConnectedNode {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  skills?: { id: string; name: string; description: string; available: boolean; status: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN"; healthSummary?: string; checks?: Array<{ id: string; label: string; ok: boolean; required?: boolean; message?: string; hint?: string; actionType?: "env" | "oauth" | "binary" | "auth_cli" | "manual" }> }[];
  ws: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  runningVibers: string[];
  /** Jobs currently loaded on this node's scheduler. */
  jobs: NodeJobEntry[];
  /** Latest machine resource status from heartbeat */
  machineStatus?: MachineResourceStatus;
  /** Latest viber running status from heartbeat */
  viberStatus?: ViberRunningStatus;
  /** Latest config sync state from heartbeat or config:ack */
  configState?: {
    configVersion: string;
    lastConfigPullAt: string;
    validations: Array<{
      category: string;
      status: string;
      message?: string;
      checkedAt: string;
    }>;
  };
  /** Pending status:request resolver (for on-demand status requests) */
  pendingStatusResolvers?: Array<(status: NodeObservabilityStatus) => void>;
}

interface ViberEvent {
  at: string;
  event: any;
}

interface SystemEvent {
  at: string;
  category: "system";
  component: string;
  level: "info" | "warn" | "error";
  message: string;
  nodeId?: string;
  nodeName?: string;
  metadata?: Record<string, unknown>;
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
  streamChunks: string[];
  streamBytes: number;
}

export class GatewayServer {
  private static readonly MAX_STREAM_BUFFER_BYTES = 2_000_000;
  private static readonly MAX_NODE_EVENTS = 200;

  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private nodes: Map<string, ConnectedNode> = new Map();
  private vibers: Map<string, Viber> = new Map();
  // Active SSE stream subscribers per viber.
  private streamSubscribers: Map<string, ServerResponse[]> = new Map();
  // System-level events ring buffer (node connect/disconnect/heartbeat-miss)
  private nodeEvents: SystemEvent[] = [];

  constructor(private config: GatewayConfig) {}

  private pushNodeEvent(evt: Omit<SystemEvent, "at" | "category">): void {
    this.nodeEvents.push({ ...evt, at: new Date().toISOString(), category: "system" });
    if (this.nodeEvents.length > GatewayServer.MAX_NODE_EVENTS) {
      this.nodeEvents.shift();
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleHttp(req, res));

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`[Gateway] Port ${this.config.port} is already in use.`);
          console.error(
            `[Gateway] Kill the existing process with: lsof -ti :${this.config.port} | xargs kill`,
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
        console.log(`[Gateway] Server listening on port ${this.config.port}`);
        console.log(`[Gateway] REST API: http://localhost:${this.config.port}`);
        console.log(`[Gateway] WebSocket: ws://localhost:${this.config.port}/ws`);
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
              console.log("[Gateway] Server stopped");
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else if (this.server) {
        this.server.close(() => {
          console.log("[Gateway] Server stopped");
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
      "Content-Type, Authorization",
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
    } else if (url.pathname === "/api/jobs" && method === "GET") {
      this.handleListAllJobs(res);
    } else if (url.pathname === "/api/events" && method === "GET") {
      this.handleListEvents(url, res);
    } else if (url.pathname === "/api/vibers" && method === "GET") {
      this.handleListVibers(res);
    } else if (url.pathname === "/api/vibers" && method === "POST") {
      this.handleCreateViber(req, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+$/) &&
      method === "GET"
    ) {
      const viberId = decodeURIComponent(url.pathname.split("/").pop()!);
      this.handleGetViber(viberId, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+\/message$/) &&
      method === "POST"
    ) {
      const viberId = decodeURIComponent(url.pathname.split("/")[3]);
      this.handleSendMessage(viberId, req, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+\/stop$/) &&
      method === "POST"
    ) {
      const viberId = decodeURIComponent(url.pathname.split("/")[3]);
      this.handleStopViber(viberId, res);
    } else if (
      url.pathname.match(/^\/api\/vibers\/[^/]+\/stream$/) &&
      method === "GET"
    ) {
      const viberId = decodeURIComponent(url.pathname.split("/")[3]);
      this.handleStreamViber(viberId, req, res);
    } else if (
      url.pathname.match(/^\/api\/nodes\/[^/]+\/status$/) &&
      method === "GET"
    ) {
      const nodeId = decodeURIComponent(url.pathname.split("/")[3]);
      this.handleGetNodeStatus(nodeId, req, res);
    } else if (
      url.pathname.match(/^\/api\/nodes\/[^/]+\/job$/) &&
      method === "POST"
    ) {
      const nodeId = decodeURIComponent(url.pathname.split("/")[3]);
      this.handlePushJobToNode(nodeId, req, res);
    } else if (
      url.pathname.match(/^\/api\/nodes\/[^/]+\/config-push$/) &&
      method === "POST"
    ) {
      const nodeId = decodeURIComponent(url.pathname.split("/")[3]);
      this.handlePushConfigToNode(nodeId, res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }

  private handleHealth(res: ServerResponse): void {
    // Aggregate node health summary
    const nodesSummary = Array.from(this.nodes.values()).map((n) => {
      const heartbeatAgeMs = Date.now() - n.lastHeartbeat.getTime();
      const isHealthy = heartbeatAgeMs < 90_000; // healthy if heartbeat within 90s

      return {
        id: n.id,
        name: n.name,
        healthy: isHealthy,
        heartbeatAgeMs,
        runningVibers: n.runningVibers.length,
        cpu: n.machineStatus?.cpu.averageUsage,
        memoryUsagePercent: n.machineStatus?.memory.usagePercent,
      };
    });

    const totalRunningVibers = this.vibers.size;
    const healthyNodes = nodesSummary.filter((n) => n.healthy).length;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        nodes: this.nodes.size,
        healthyNodes,
        vibers: totalRunningVibers,
        nodesSummary,
      }),
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
      // Config sync state
      configState: n.configState,
      // Enriched observability data from heartbeats
      machine: n.machineStatus
        ? {
            hostname: n.machineStatus.hostname,
            arch: n.machineStatus.arch,
            systemUptimeSeconds: n.machineStatus.systemUptimeSeconds,
            cpu: {
              cores: n.machineStatus.cpu.cores,
              averageUsage: n.machineStatus.cpu.averageUsage,
            },
            memory: {
              totalBytes: n.machineStatus.memory.totalBytes,
              usedBytes: n.machineStatus.memory.usedBytes,
              usagePercent: n.machineStatus.memory.usagePercent,
            },
            loadAverage: n.machineStatus.loadAverage,
          }
        : undefined,
      viber: n.viberStatus
        ? {
            daemonUptimeSeconds: n.viberStatus.daemonUptimeSeconds,
            runningTaskCount: n.viberStatus.runningTaskCount,
            totalTasksExecuted: n.viberStatus.totalTasksExecuted,
            processMemory: n.viberStatus.processMemory,
          }
        : undefined,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: true, nodes }));
  }

  private handleListVibers(res: ServerResponse): void {
    const vibers = Array.from(this.vibers.values()).map((v) => {
      const node = this.nodes.get(v.nodeId);
      return {
        id: v.id,
        nodeId: v.nodeId,
        nodeName: node?.name ?? v.nodeId,
        goal: v.goal,
        status: v.status,
        createdAt: v.createdAt.toISOString(),
        completedAt: v.completedAt?.toISOString(),
        eventCount: v.events.length,
        partialText: v.partialText,
        isNodeConnected: !!node,
      };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ vibers }));
  }

  /**
   * GET /api/events - Unified chronological event stream across all vibers + system events.
   * Supports ?limit=200&since=<ISO timestamp>
   */
  private handleListEvents(url: URL, res: ServerResponse): void {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 1000);
    const since = url.searchParams.get("since");
    const sinceMs = since ? new Date(since).getTime() : 0;

    // Collect viber activity events
    const activityEvents: Array<{
      at: string;
      category: "activity";
      viberId: string;
      goal: string;
      viberStatus: string;
      event: any;
    }> = [];

    for (const [id, viber] of this.vibers) {
      for (const evt of viber.events) {
        if (sinceMs && new Date(evt.at).getTime() <= sinceMs) continue;
        activityEvents.push({
          at: evt.at,
          category: "activity",
          viberId: id,
          goal: viber.goal,
          viberStatus: viber.status,
          event: evt.event,
        });
      }
    }

    // Collect system events
    const systemEvents = sinceMs
      ? this.nodeEvents.filter((e) => new Date(e.at).getTime() > sinceMs)
      : [...this.nodeEvents];

    // Merge and sort descending
    const allEvents = [
      ...activityEvents.map((e) => ({ ...e } as Record<string, unknown>)),
      ...systemEvents.map((e) => ({ ...e } as Record<string, unknown>)),
    ];
    allEvents.sort(
      (a, b) =>
        new Date(b.at as string).getTime() - new Date(a.at as string).getTime(),
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ events: allEvents.slice(0, limit) }));
  }

  private handleCreateViber(req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { goal, nodeId, messages, environment, settings, oauthTokens, model } = JSON.parse(body);

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
          streamChunks: [],
          streamBytes: 0,
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
            settings,
            oauthTokens,
            options: model ? { model } : undefined,
          }),
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
      }),
    );
  }

  /**
   * POST /api/vibers/:id/message - Send a message to an existing viber.
   * Reuses the viber ID, resets its status, and sends the messages to the node.
   */
  private handleSendMessage(
    viberId: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
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
        const { messages, goal, environment, settings, oauthTokens, model } = JSON.parse(body);

        // Reset viber state for the new message
        viber.status = "pending";
        viber.completedAt = undefined;
        viber.result = undefined;
        viber.error = undefined;
        viber.events = [];
        viber.partialText = "";
        viber.streamChunks = [];
        viber.streamBytes = 0;
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
            settings,
            oauthTokens,
            options: model ? { model } : undefined,
          }),
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
   * POST /api/nodes/:id/config-push - Push config update to a node via WebSocket.
   */
  private handlePushConfigToNode(
    nodeId: string,
    res: ServerResponse,
  ): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Node not found or not connected" }));
      return;
    }

    // Send config:push message to the node
    node.ws.send(JSON.stringify({ type: "config:push" }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "Config push sent to node" }));
  }

  /**
   * POST /api/nodes/:nodeId/job - Push a job config to a node. The node writes it to its local jobs dir and reloads the scheduler.
   */
  private handlePushJobToNode(
    nodeId: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Node not found or not connected" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const config = JSON.parse(body || "{}");
        const { name, schedule, prompt, description, model } = config;
        if (!name || !schedule || !prompt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Missing required fields: name, schedule, prompt",
            }),
          );
          return;
        }
        const message = {
          type: "job:create",
          name: String(name).trim(),
          schedule: String(schedule).trim(),
          prompt: String(prompt).trim(),
          ...(description != null && {
            description: String(description).trim(),
          }),
          ...(model != null && { model: String(model).trim() }),
          ...(config.nodeId != null && {
            nodeId: String(config.nodeId).trim(),
          }),
        };
        node.ws.send(JSON.stringify(message));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, message: "Job pushed to node" }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : "Invalid JSON body",
          }),
        );
      }
    });
  }

  /**
   * GET /api/nodes/:id/status - Get detailed node observability status.
   *
   * If the node has recent heartbeat data, returns it immediately.
   * Also sends a status:request to the node for fresh data with a short timeout.
   */
  private handleGetNodeStatus(
    nodeId: string,
    _req: IncomingMessage,
    res: ServerResponse,
  ): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Node not found or not connected" }));
      return;
    }

    // If we have recent heartbeat data (within 60s), combine and return it
    const heartbeatAge =
      Date.now() - node.lastHeartbeat.getTime();

    if (
      node.machineStatus &&
      node.viberStatus &&
      heartbeatAge < 60_000 &&
      node.viberStatus.skillHealth
    ) {
      // Return cached status from last heartbeat
      const status: NodeObservabilityStatus = {
        machine: node.machineStatus,
        viber: node.viberStatus,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ nodeId, status, source: "heartbeat-cache" }));
      return;
    }

    // Request fresh status from the node with a timeout
    if (!node.pendingStatusResolvers) {
      node.pendingStatusResolvers = [];
    }

    const timeout = setTimeout(() => {
      // Timeout: return whatever we have
      const idx = node.pendingStatusResolvers?.indexOf(resolver);
      if (idx !== undefined && idx >= 0) {
        node.pendingStatusResolvers?.splice(idx, 1);
      }

      if (node.machineStatus || node.viberStatus) {
        const status: Partial<NodeObservabilityStatus> = {};
        if (node.machineStatus) status.machine = node.machineStatus;
        if (node.viberStatus) status.viber = node.viberStatus;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ nodeId, status, source: "heartbeat-stale" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            nodeId,
            status: null,
            source: "unavailable",
            message: "Node has not reported status yet",
          }),
        );
      }
    }, 5_000);

    const resolver = (status: NodeObservabilityStatus) => {
      clearTimeout(timeout);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ nodeId, status, source: "live" }));
    };

    node.pendingStatusResolvers.push(resolver);
    node.ws.send(JSON.stringify({ type: "status:request" }));
  }

  /**
   * GET /api/vibers/:id/stream - SSE endpoint for AI SDK data stream.
   * Holds the response open and pipes viber stream chunks from the daemon.
   */
  private handleStreamViber(
    viberId: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
    const viber = this.vibers.get(viberId);
    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found" }));
      return;
    }

    // Set SSE headers with AI SDK stream protocol marker
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "x-vercel-ai-ui-message-stream": "v1",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "x-vercel-ai-ui-message-stream",
    });

    // Replay stream chunks that were emitted before this SSE subscriber connected.
    for (const chunk of viber.streamChunks) {
      res.write(chunk);
    }

    // If viber is already completed/error/stopped, replay and close immediately.
    if (
      viber.status === "completed" ||
      viber.status === "error" ||
      viber.status === "stopped"
    ) {
      res.end();
      return;
    }

    // Register as an active subscriber for live chunks.
    if (!this.streamSubscribers.has(viberId)) {
      this.streamSubscribers.set(viberId, []);
    }
    const subs = this.streamSubscribers.get(viberId)!;
    subs.push(res);

    // Handle client disconnect
    req.on("close", () => {
      const idx = subs.indexOf(res);
      if (idx >= 0) subs.splice(idx, 1);
      if (subs.length === 0) this.streamSubscribers.delete(viberId);
    });
  }

  // ==================== WebSocket Handler ====================

  private handleNodeConnection(ws: WebSocket, req: IncomingMessage): void {
    const nodeId = req.headers["x-viber-id"] as string;
    console.log(`[Gateway] Node connecting: ${nodeId || "unknown"}`);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleNodeMessage(ws, msg);
      } catch (error) {
        console.error("[Gateway] Failed to parse node message:", error);
      }
    });

    ws.on("close", () => {
      // Find and remove node
      for (const [id, node] of this.nodes) {
        if (node.ws === ws) {
          console.log(`[Gateway] Node disconnected: ${id}`);
          this.pushNodeEvent({
            component: "node",
            level: "warn",
            message: `Node disconnected: ${node.name}`,
            nodeId: id,
            nodeName: node.name,
          });
          this.nodes.delete(id);
          break;
        }
      }
    });

    ws.on("error", (error) => {
      console.error("[Gateway] Node WebSocket error:", error);
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
        this.handleViberError(msg.viberId || msg.taskId, msg.error, msg.model);
        break;

      case "heartbeat":
        this.handleHeartbeat(ws, msg.status);
        break;

      case "pong":
        // Response to ping, update lastHeartbeat
        this.handleHeartbeat(ws);
        break;

      case "jobs:list":
        this.handleNodeJobsList(ws, msg.jobs);
        break;

      case "status:report":
        this.handleStatusReport(ws, msg.status);
        break;

      case "config:ack":
        this.handleConfigAck(ws, msg.configVersion, msg.validations);
        break;

      default:
        console.log(`[Gateway] Unknown message type: ${msg.type}`);
    }
  }

  private handleNodeConnected(ws: WebSocket, nodeInfo: any): void {
    console.log(`[Gateway] Node registered: ${nodeInfo.id} (${nodeInfo.name})`);

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
      jobs: [],
    });

    this.pushNodeEvent({
      component: "node",
      level: "info",
      message: `Node connected: ${nodeInfo.name}`,
      nodeId: nodeInfo.id,
      nodeName: nodeInfo.name,
      metadata: {
        version: nodeInfo.version,
        platform: nodeInfo.platform,
        capabilities: nodeInfo.capabilities,
        skillCount: nodeInfo.skills?.length ?? 0,
      },
    });
  }

  private handleViberStarted(viberId: string): void {
    const viber = this.vibers.get(viberId);
    if (viber) {
      viber.status = "running";
      console.log(`[Gateway] Viber started: ${viberId}`);
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
      console.log(`[Gateway] Viber completed: ${viberId}`);

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
    payload: any,
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

  private handleViberError(viberId: string, error: string, model?: string): void {
    const viber = this.vibers.get(viberId);
    if (viber) {
      viber.status = "error";
      viber.error = error;
      viber.completedAt = new Date();
      console.log(`[Gateway] Viber error: ${viberId} - ${error}${model ? ` (model: ${model})` : ""}`);

      // Push an error event so it appears in the /api/events stream (and Logs page)
      const now = new Date().toISOString();
      viber.events.push({
        at: now,
        event: {
          kind: "error",
          message: error,
          model: model ?? undefined,
          phase: "execution",
        },
      });

      // Close SSE stream subscribers
      this.closeStreamSubscribers(viberId);
    }
  }

  /**
   * Handle viber:stream-chunk — pipe raw AI SDK SSE bytes to SSE subscribers.
   */
  private handleViberStreamChunk(viberId: string, chunk: string): void {
    const viber = this.vibers.get(viberId);
    if (!viber) {
      return;
    }

    // Buffer chunks on the viber itself so late subscribers can replay the stream.
    viber.streamChunks.push(chunk);
    viber.streamBytes += Buffer.byteLength(chunk);
    while (
      viber.streamChunks.length > 0 &&
      viber.streamBytes > GatewayServer.MAX_STREAM_BUFFER_BYTES
    ) {
      const removed = viber.streamChunks.shift();
      if (removed) {
        viber.streamBytes -= Buffer.byteLength(removed);
      }
    }

    const subs = this.streamSubscribers.get(viberId) || [];
    for (const sub of subs) {
      if (!sub.writableEnded) {
        sub.write(chunk);
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
        if (!sub.writableEnded) {
          sub.end();
        }
      }
      this.streamSubscribers.delete(viberId);
    }
  }

  /**
   * Handle jobs:list message from a node — store the node's loaded job list.
   */
  private handleNodeJobsList(ws: WebSocket, jobs: NodeJobEntry[]): void {
    for (const node of this.nodes.values()) {
      if (node.ws === ws) {
        node.jobs = Array.isArray(jobs) ? jobs : [];
        console.log(`[Gateway] Node ${node.id} reported ${node.jobs.length} job(s)`);
        break;
      }
    }
  }

  /**
   * GET /api/jobs — Return jobs from all connected nodes.
   * The web frontend queries this to observe jobs created from chat or
   * pushed to nodes, giving full visibility across the fleet.
   */
  private handleListAllJobs(res: ServerResponse): void {
    const nodeJobs = Array.from(this.nodes.values()).map((n) => ({
      nodeId: n.id,
      nodeName: n.name,
      jobs: n.jobs.map((j) => ({
        name: j.name,
        description: j.description,
        schedule: j.schedule,
        prompt: j.prompt,
        model: j.model,
        nodeId: j.nodeId,
      })),
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ nodeJobs }));
  }

  private handleHeartbeat(ws: WebSocket, heartbeatStatus?: any): void {
    for (const node of this.nodes.values()) {
      if (node.ws === ws) {
        node.lastHeartbeat = new Date();

        // Store enriched observability data from heartbeat
        if (heartbeatStatus) {
          if (heartbeatStatus.machine) {
            node.machineStatus = heartbeatStatus.machine;
          }
          if (heartbeatStatus.viberStatus) {
            node.viberStatus = heartbeatStatus.viberStatus;
          }
          // Update skill availability info from heartbeat
          if (heartbeatStatus.skills) {
            node.skills = heartbeatStatus.skills;
          }
          // Update config sync state from heartbeat
          if (heartbeatStatus.configState) {
            node.configState = heartbeatStatus.configState;
          }
        }

        break;
      }
    }
  }

  /**
   * Handle config:ack message from a node — store config sync state.
   */
  private handleConfigAck(
    ws: WebSocket,
    configVersion: string,
    validations: Array<{ category: string; status: string; message?: string; checkedAt: string }>,
  ): void {
    for (const node of this.nodes.values()) {
      if (node.ws === ws) {
        node.configState = {
          configVersion,
          lastConfigPullAt: new Date().toISOString(),
          validations,
        };
        console.log(`[Gateway] Node ${node.id} acknowledged config version ${configVersion}`);
        break;
      }
    }
  }

  /**
   * Handle a status:report message from a node (response to status:request).
   */
  private handleStatusReport(ws: WebSocket, status: NodeObservabilityStatus): void {
    for (const node of this.nodes.values()) {
      if (node.ws === ws) {
        node.lastHeartbeat = new Date();

        // Update cached status
        if (status.machine) {
          node.machineStatus = status.machine;
        }
        if (status.viber) {
          node.viberStatus = status.viber;
        }

        // Resolve any pending status request
        if (node.pendingStatusResolvers && node.pendingStatusResolvers.length > 0) {
          for (const resolver of node.pendingStatusResolvers) {
            resolver(status);
          }
          node.pendingStatusResolvers = [];
        }

        break;
      }
    }
  }
}

/** @deprecated Use GatewayServer instead */
export const BoardServer = GatewayServer;

/** @deprecated Use GatewayServer instead */
export const HubServer = GatewayServer;
