/**
 * Gateway Server - Central coordinator for vibers
 *
 * The gateway accepts WebSocket connections from viber daemons and provides
 * a REST API for the Viber Board web app to manage them.
 *
 * REST API (for Viber Board):
 *   GET  /health              - Health check
 *   GET  /api/vibers           - List connected vibers
 *   GET  /api/events          - Unified event stream (activity + system)
 *   GET  /api/tasks           - List all tasks (sessions)
 *   POST /api/tasks           - Create a new task on a viber
 *   GET  /api/tasks/:id       - Get task details
 *   POST /api/tasks/:id/stop  - Stop a task
 *   GET  /api/tasks/:id/stream - SSE stream for task output
 *
 * WebSocket (for viber daemons):
 *   ws://localhost:6007/ws - Viber daemon connection endpoint
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { Router, readJsonBody } from "../utils/router";
import type {
  MachineResourceStatus,
  ViberRunningStatus,
  ViberSystemStatus,
} from "../daemon/telemetry";

export interface GatewayConfig {
  port: number;
  /** Web API base URL for persisting config sync state (optional) */
  webApiUrl?: string;
  /** API token for authenticating with web API (optional) */
  webApiToken?: string;
}



interface NodeJobEntry {
  name: string;
  schedule: string;
  prompt: string;
  description?: string;
  model?: string;
  viberId?: string;
}

interface ConnectedViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
    status: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
    healthSummary?: string;
    checks?: Array<{
      id: string;
      label: string;
      ok: boolean;
      required?: boolean;
      message?: string;
      hint?: string;
      actionType?: "env" | "oauth" | "binary" | "auth_cli" | "manual";
    }>;
  }>;
  ws: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  runningVibers: string[];
  /** Jobs currently loaded on this viber's scheduler. */
  jobs: NodeJobEntry[];
  /** Latest machine resource status from heartbeat */
  machineStatus?: MachineResourceStatus;
  /** Latest viber running status from heartbeat */
  viberStatus?: ViberRunningStatus;
  /** Pending status:request resolver (for on-demand status requests) */
  pendingStatusResolvers?: Array<(status: ViberSystemStatus) => void>;
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
  viberId?: string;
  viberName?: string;
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
  viberId: string;
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
  private static readonly MAX_VIBER_EVENTS = 200;

  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private vibers: Map<string, ConnectedViber> = new Map();
  private tasks: Map<string, Viber> = new Map();
  // Active SSE stream subscribers per viber.
  private streamSubscribers: Map<string, ServerResponse[]> = new Map();
  // System-level events ring buffer (viber connect/disconnect/heartbeat-miss)
  private viberEvents: SystemEvent[] = [];
  // In-flight skill provisioning requests waiting for viber replies
  private pendingSkillProvisionResolvers: Map<
    string,
    {
      resolve: (payload: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  private router = new Router();

  constructor(private config: GatewayConfig) {
    this.setupRoutes();
  }

  private pushViberEvent(evt: Omit<SystemEvent, "at" | "category">): void {
    this.viberEvents.push({ ...evt, at: new Date().toISOString(), category: "system" });
    if (this.viberEvents.length > GatewayServer.MAX_VIBER_EVENTS) {
      this.viberEvents.shift();
    }
  }

  private setupRoutes(): void {
    this.router.get("/health", this.handleHealth.bind(this));

    this.router.get("/api/vibers", this.handleListVibers.bind(this));
    this.router.get("/api/vibers/:id/status", this.handleGetViberStatus.bind(this));
    this.router.post("/api/vibers/:id/job", this.handlePushJobToViber.bind(this));
    this.router.post("/api/vibers/:id/config-push", this.handleConfigPush.bind(this));
    this.router.post("/api/vibers/:id/skills/provision", this.handleProvisionViberSkill.bind(this));

    this.router.get("/api/jobs", this.handleListAllJobs.bind(this));
    this.router.get("/api/events", this.handleListEvents.bind(this));

    this.router.get("/api/tasks", this.handleListTasks.bind(this));
    this.router.post("/api/tasks", this.handleCreateTask.bind(this));
    this.router.get("/api/tasks/:id", this.handleGetTask.bind(this));
    this.router.post("/api/tasks/:id/message", this.handleSendMessage.bind(this));
    this.router.post("/api/tasks/:id/stop", this.handleStopTask.bind(this));
    this.router.get("/api/tasks/:id/stream", this.handleStreamTask.bind(this));
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.router.handle(req, res));

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
        this.handleViberConnection(ws, req);
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
    // Close all viber connections
    for (const node of this.vibers.values()) {
      node.ws.close();
    }
    this.vibers.clear();
    for (const pending of this.pendingSkillProvisionResolvers.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingSkillProvisionResolvers.clear();

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

  private handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    // Aggregate viber health summary
    const vibersSummary = Array.from(this.vibers.values()).map((n) => {
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

    const totalRunningVibers = this.tasks.size;
    const healthyVibers = vibersSummary.filter((n) => n.healthy).length;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        nodes: this.vibers.size,
        healthyVibers,
        vibers: totalRunningVibers,
        vibersSummary,
      }),
    );
  }

  private handleListVibers(_req: IncomingMessage, res: ServerResponse): void {
    const nodes = Array.from(this.vibers.values()).map((n) => ({
      id: n.id,
      name: n.name,
      version: n.version,
      platform: n.platform,
      capabilities: n.capabilities,
      skills: n.skills,
      connectedAt: n.connectedAt.toISOString(),
      lastHeartbeat: n.lastHeartbeat.toISOString(),
      runningVibers: n.runningVibers,
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

  private handleListTasks(_req: IncomingMessage, res: ServerResponse): void {
    const vibers = Array.from(this.tasks.values()).map((v) => {
      const node = this.vibers.get(v.viberId);
      return {
        id: v.id,
        viberId: v.viberId,
        viberName: node?.name ?? v.viberId,
        goal: v.goal,
        status: v.status,
        createdAt: v.createdAt.toISOString(),
        completedAt: v.completedAt?.toISOString(),
        eventCount: v.events.length,
        partialText: v.partialText,
        isConnected: !!node,
      };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ vibers }));
  }

  /**
   * GET /api/events - Unified chronological event stream across all vibers + system events.
   * Supports ?limit=200&since=<ISO timestamp>
   */
  private handleListEvents(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
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

    for (const [id, viber] of this.tasks) {
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
      ? this.viberEvents.filter((e) => new Date(e.at).getTime() > sinceMs)
      : [...this.viberEvents];

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

  private async handleCreateTask(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const { goal, viberId: requestedViberId, messages, environment, settings, oauthTokens, model } = await readJsonBody(req);

      if (!goal) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing goal" }));
        return;
      }

      // Find viber (use specified or first available)
      let node: ConnectedViber | undefined;
      if (requestedViberId) {
        node = this.vibers.get(requestedViberId);
      } else {
        node = this.vibers.values().next().value;
      }

      if (!node) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No viber available" }));
        return;
      }

      // Create task
      const viberId = `viber-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const viber: Viber = {
        id: viberId,
        viberId: node.id,
        goal,
        status: "pending",
        createdAt: new Date(),
        events: [],
        partialText: "",
        streamChunks: [],
        streamBytes: 0,
      };
      this.tasks.set(viberId, viber);

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
      res.end(JSON.stringify({ viberId }));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
  }

  private handleGetTask(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): void {
    const taskId = params.id;
    const viber = this.tasks.get(taskId);

    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    // Include node info for connectivity
    const node = this.vibers.get(viber.viberId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: viber.id,
        viberId: viber.viberId,
        viberName: node?.name ?? viber.viberId,
        goal: viber.goal,
        status: viber.status,
        result: viber.result,
        error: viber.error,
        createdAt: viber.createdAt.toISOString(),
        completedAt: viber.completedAt?.toISOString(),
        events: viber.events,
        eventCount: viber.events.length,
        partialText: viber.partialText,
        isConnected: !!node,
      }),
    );
  }

  /**
   * POST /api/tasks/:id/message - Send a message to an existing task.
   * Reuses the task ID, resets its status, and sends the messages to the viber.
   */
  private async handleSendMessage(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): Promise<void> {
    const viberId = params.id;
    const viber = this.tasks.get(viberId);
    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    const node = this.vibers.get(viber.viberId);
    if (!node) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Node not connected" }));
      return;
    }

    try {
      const { messages, goal, environment, settings, oauthTokens, model } = await readJsonBody(req);

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

      // Send message to the viber daemon
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
      res.end(JSON.stringify({ viberId }));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
  }

  private handleStopTask(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): void {
    const viberId = params.id;
    const viber = this.tasks.get(viberId);

    if (!viber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    const node = this.vibers.get(viber.viberId);
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
   * POST /api/vibers/:viberId/job - Push a job config to a viber. The viber writes it to its local jobs dir and reloads the scheduler.
   */
  private async handlePushJobToViber(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): Promise<void> {
    const viberId = params.id;
    const node = this.vibers.get(viberId);
    if (!node) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found or not connected" }));
      return;
    }

    try {
      const config = await readJsonBody(req);
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
        ...(config.viberId != null && {
          viberId: String(config.viberId).trim(),
        }),
      };
      node.ws.send(JSON.stringify(message));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, message: "Job pushed to viber" }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Invalid JSON body",
        }),
      );
    }
  }

  /**
   * POST /api/vibers/:viberId/skills/provision - Run deterministic skill setup actions on a viber.
   * The gateway sends a direct command to the viber and waits for a result payload.
   */
  private async handleProvisionViberSkill(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): Promise<void> {
    const viberId = params.id;
    const node = this.vibers.get(viberId);
    if (!node) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found or not connected" }));
      return;
    }

    let requestId = "";
    try {
      const parsed = await readJsonBody(req);
      const skillId = String(parsed.skillId || "").trim();
      if (!skillId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing skillId" }));
        return;
      }

      requestId = String(parsed.requestId || `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const authAction =
        parsed.authAction === "none" ||
          parsed.authAction === "copy" ||
          parsed.authAction === "start"
          ? parsed.authAction
          : "copy";

      const timeout = setTimeout(() => {
        this.pendingSkillProvisionResolvers.delete(requestId);
        if (!res.writableEnded) {
          res.writeHead(504, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Timed out waiting for viber skill provisioning result",
              requestId,
              skillId,
            }),
          );
        }
      }, 90_000);

      this.pendingSkillProvisionResolvers.set(requestId, {
        timeout,
        resolve: (payload: any) => {
          if (res.writableEnded) return;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
        },
      });

      node.ws.send(
        JSON.stringify({
          type: "skill:provision",
          requestId,
          skillId,
          install: parsed.install !== false,
          authAction,
        }),
      );
    } catch (error) {
      if (requestId) {
        const pending = this.pendingSkillProvisionResolvers.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingSkillProvisionResolvers.delete(requestId);
        }
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Invalid JSON body",
        }),
      );
    }
  }

  /**
   * GET /api/vibers/:id/status - Get detailed viber observability status.
   *
   * If the viber has recent heartbeat data, returns it immediately.
   * Also sends a status:request to the viber for fresh data with a short timeout.
   */
  private handleGetViberStatus(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): void {
    const viberId = params.id;
    const node = this.vibers.get(viberId);
    if (!node) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found or not connected" }));
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
      const status: ViberSystemStatus = {
        machine: node.machineStatus,
        viber: node.viberStatus,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ viberId, status, source: "heartbeat-cache" }));
      return;
    }

    // Request fresh status from the viber with a timeout
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
        const status: Partial<ViberSystemStatus> = {};
        if (node.machineStatus) status.machine = node.machineStatus;
        if (node.viberStatus) status.viber = node.viberStatus;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ viberId, status, source: "heartbeat-stale" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            viberId,
            status: null,
            source: "unavailable",
            message: "Viber has not reported status yet",
          }),
        );
      }
    }, 5_000);

    const resolver = (status: ViberSystemStatus) => {
      clearTimeout(timeout);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ viberId, status, source: "live" }));
    };

    node.pendingStatusResolvers.push(resolver);
    node.ws.send(JSON.stringify({ type: "status:request" }));
  }

  /**
   * GET /api/tasks/:id/stream - SSE endpoint for AI SDK data stream.
   * Holds the response open and pipes task stream chunks from the daemon.
   */
  private handleStreamTask(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): void {
    const viberId = params.id;
    const viber = this.tasks.get(viberId);
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

  private handleViberConnection(ws: WebSocket, req: IncomingMessage): void {
    const viberId = req.headers["x-viber-id"] as string;
    console.log(`[Gateway] Viber connecting: ${viberId || "unknown"}`);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleViberMessage(ws, msg);
      } catch (error) {
        console.error("[Gateway] Failed to parse viber message:", error);
      }
    });

    ws.on("close", () => {
      // Find and remove viber
      for (const [id, node] of this.vibers) {
        if (node.ws === ws) {
          console.log(`[Gateway] Viber disconnected: ${id}`);
          this.pushViberEvent({
            component: "viber",
            level: "warn",
            message: `Viber disconnected: ${node.name}`,
            viberId: id,
            viberName: node.name,
          });
          this.vibers.delete(id);
          break;
        }
      }
    });

    ws.on("error", (error) => {
      console.error("[Gateway] Viber WebSocket error:", error);
    });
  }

  private handleViberMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case "connected":
        this.handleViberConnected(ws, msg.viber);
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
        this.handleViberJobsList(ws, msg.jobs);
        break;

      case "status:report":
        this.handleStatusReport(ws, msg.status);
        break;

      case "skill:provision-result":
        this.handleSkillProvisionResult(msg);

      case "config:ack":
        this.handleConfigAck(ws, msg.configVersion, msg.validations);
        break;

      default:
        console.log(`[Gateway] Unknown message type: ${msg.type}`);
    }
  }

  private handleViberConnected(ws: WebSocket, nodeInfo: any): void {
    console.log(`[Gateway] Viber registered: ${nodeInfo.id} (${nodeInfo.name})`);

    this.vibers.set(nodeInfo.id, {
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

    this.pushViberEvent({
      component: "viber",
      level: "info",
      message: `Viber connected: ${nodeInfo.name}`,
      viberId: nodeInfo.id,
      viberName: nodeInfo.name,
      metadata: {
        version: nodeInfo.version,
        platform: nodeInfo.platform,
        capabilities: nodeInfo.capabilities,
        skillCount: nodeInfo.skills?.length ?? 0,
      },
    });
  }

  private handleViberStarted(viberId: string): void {
    const viber = this.tasks.get(viberId);
    if (viber) {
      viber.status = "running";
      console.log(`[Gateway] Task started: ${viberId}`);
    }
  }

  private handleViberCompleted(viberId: string, result: any): void {
    const viber = this.tasks.get(viberId);
    if (viber) {
      viber.status = "completed";
      viber.result = result;
      viber.completedAt = new Date();
      if (typeof result?.text === "string") {
        viber.partialText = result.text;
      }
      console.log(`[Gateway] Task completed: ${viberId}`);

      // Close SSE stream subscribers
      this.closeStreamSubscribers(viberId);
    }
  }

  private handleViberProgress(viberId: string, event: any): void {
    const viber = this.tasks.get(viberId);
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
    const viber = this.tasks.get(viberId);
    if (viber) {
      viber.status = "error";
      viber.error = error;
      viber.completedAt = new Date();
      console.log(`[Gateway] Task error: ${viberId} - ${error}${model ? ` (model: ${model})` : ""}`);

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
    const viber = this.tasks.get(viberId);
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
   * Handle jobs:list message from a viber — store the node's loaded job list.
   */
  private handleViberJobsList(ws: WebSocket, jobs: NodeJobEntry[]): void {
    for (const node of this.vibers.values()) {
      if (node.ws === ws) {
        node.jobs = Array.isArray(jobs) ? jobs : [];
        console.log(`[Gateway] Viber ${node.id} reported ${node.jobs.length} job(s)`);
        break;
      }
    }
  }

  /**
   * GET /api/jobs — Return jobs from all connected vibers.
   * The web frontend queries this to observe jobs created from chat or
   * pushed to vibers, giving full visibility across the fleet.
   */
  private handleListAllJobs(_req: IncomingMessage, res: ServerResponse): void {
    const nodeJobs = Array.from(this.vibers.values()).map((n) => ({
      viberId: n.id,
      viberName: n.name,
      jobs: n.jobs.map((j) => ({
        name: j.name,
        description: j.description,
        schedule: j.schedule,
        prompt: j.prompt,
        model: j.model,
        viberId: j.viberId,
      })),
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ nodeJobs }));
  }

  private handleHeartbeat(ws: WebSocket, heartbeatStatus?: any): void {
    for (const node of this.vibers.values()) {
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
        }

        break;
      }
    }
  }

  /**
   * Handle a status:report message from a viber (response to status:request).
   */
  private handleStatusReport(ws: WebSocket, status: ViberSystemStatus): void {
    for (const node of this.vibers.values()) {
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

  private handleSkillProvisionResult(msg: any): void {
    const requestId = String(msg?.requestId || "").trim();
    if (!requestId) return;
    const pending = this.pendingSkillProvisionResolvers.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingSkillProvisionResolvers.delete(requestId);
    pending.resolve(msg);
  }

  /**
   * POST /api/vibers/:id/config-push - Push config to a viber.
   * Sends config:push WebSocket message to the target node.
   */
  private handleConfigPush(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ): void {
    const viberId = params.id;
    const node = this.vibers.get(viberId);
    if (!node) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found or not connected" }));
      return;
    }

    try {
      node.ws.send(JSON.stringify({ type: "config:push" }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, message: "Config push sent to viber" }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Failed to push config",
        }),
      );
    }
  }

  /**
   * Handle config:ack message from a viber (response to config:push).
   */
  private handleConfigAck(
    ws: WebSocket,
    configVersion: string,
    validations: Array<{
      category: string;
      status: string;
      message?: string;
      checkedAt: string;
    }>,
  ): void {
    for (const node of this.vibers.values()) {
      if (node.ws === ws) {
        console.log(
          `[Gateway] Viber ${node.id} acknowledged config push: version=${configVersion}, validations=${validations.length}`,
        );

        // Persist config sync state to Supabase via web API
        const webApiUrl = this.config.webApiUrl || process.env.OPENVIBER_WEB_API_URL;
        const webApiToken = this.config.webApiToken || process.env.VIBER_GATEWAY_API_TOKEN;

        if (webApiUrl && webApiToken) {
          const syncState = {
            configVersion,
            lastConfigPullAt: new Date().toISOString(),
            validations,
          };

          // Call web API asynchronously (don't block)
          fetch(`${webApiUrl}/api/vibers/${encodeURIComponent(node.id)}/config-sync-state`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${webApiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ config_sync_state: syncState }),
          }).catch((error) => {
            console.error(
              `[Gateway] Failed to persist config sync state for node ${node.id}:`,
              error,
            );
          });
        } else {
          console.warn(
            `[Gateway] Cannot persist config sync state: web API URL or token not configured`,
          );
        }

        break;
      }
    }
  }
}
