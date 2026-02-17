/**
 * Gateway Server — Central coordinator for vibers
 *
 * The gateway accepts WebSocket connections from viber daemons and provides
 * a REST API for the Viber Board web app to manage them.
 *
 * REST API (for Viber Board):
 *   GET  /health              - Health check
 *   GET  /api/vibers           - List connected vibers
 *   GET  /api/vibers/:id/status - Viber observability status
 *   POST /api/vibers/:id/job   - Push a job to a viber
 *   POST /api/vibers/:id/config-push - Push config to a viber
 *   POST /api/vibers/:id/skills/provision - Provision a skill on a viber
 *   GET  /api/skills           - List all skills with health status
 *   GET  /api/jobs             - List all jobs across vibers
 *   GET  /api/events           - Unified event stream (activity + system)
 *   GET  /api/tasks            - List all tasks
 *   POST /api/tasks            - Create a new task on a viber
 *   GET  /api/tasks/:id        - Get task details
 *   POST /api/tasks/:id/message - Send a message to a task
 *   POST /api/tasks/:id/stop   - Stop a task
 *   POST /api/tasks/:id/archive - Archive a task
 *   DELETE /api/tasks/:id/archive - Restore a task
 *   DELETE /api/tasks/:id       - Permanently delete a task
 *   GET  /api/tasks/:id/stream - SSE stream for task output
 *
 * WebSocket (for viber daemons):
 *   ws://localhost:6009/ws - Viber daemon connection endpoint
 */

import { createServer, type IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import { Router } from "../utils/router";
import type { GatewayConfig } from "./types";
import { TaskManager } from "./tasks";
import { ViberManager } from "./vibers";
import { EventManager } from "./events";
import { SkillsManager } from "./skills";
import { createGatewayTaskStoreFromEnv } from "./task-store";
import { createGatewayViberStoreFromEnv } from "./viber-store";

export type { GatewayConfig } from "./types";

export class GatewayServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private router = new Router();

  private eventManager: EventManager;
  private taskManager: TaskManager;
  private viberManager: ViberManager;
  private skillsManager: SkillsManager;
  private readonly apiToken: string | null;
  private readonly allowUnauthenticatedLocalhost: boolean;
  private readonly allowedOrigins: Set<string> | null;

  constructor(private config: GatewayConfig) {
    const storeEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...(config.taskStoreMode
        ? { VIBER_GATEWAY_TASK_STORE: config.taskStoreMode }
        : {}),
      ...(config.taskStoreSqlitePath
        ? { VIBER_GATEWAY_SQLITE_PATH: config.taskStoreSqlitePath }
        : {}),
      ...(config.taskStoreSupabaseUrl
        ? { VIBER_GATEWAY_SUPABASE_URL: config.taskStoreSupabaseUrl }
        : {}),
      ...(config.taskStoreSupabaseServiceRoleKey
        ? {
          VIBER_GATEWAY_SUPABASE_SERVICE_ROLE_KEY:
            config.taskStoreSupabaseServiceRoleKey,
        }
        : {}),
      ...(config.viberStoreMode
        ? { VIBER_GATEWAY_VIBER_STORE: config.viberStoreMode }
        : {}),
    };

    const taskStore =
      config.taskStore ??
      createGatewayTaskStoreFromEnv(storeEnv);
    const viberStore =
      config.viberStore ??
      createGatewayViberStoreFromEnv(storeEnv);

    this.apiToken =
      config.apiToken ??
      process.env.VIBER_GATEWAY_API_TOKEN ??
      process.env.VIBER_BOARD_API_TOKEN ??
      process.env.VIBER_HUB_API_TOKEN ??
      null;

    const allowLocalRaw =
      config.allowUnauthenticatedLocalhost ??
      process.env.VIBER_GATEWAY_ALLOW_UNAUTH_LOCALHOST ??
      "true";
    this.allowUnauthenticatedLocalhost =
      String(allowLocalRaw).toLowerCase() !== "false";

    const originsRaw =
      config.allowedOrigins ??
      (process.env.VIBER_GATEWAY_ALLOWED_ORIGINS
        ? process.env.VIBER_GATEWAY_ALLOWED_ORIGINS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : []);
    this.allowedOrigins =
      originsRaw.length > 0 ? new Set(originsRaw) : null;

    // Wire up managers with cross-references
    this.taskManager = new TaskManager(
      () => this.viberManager.vibers,
      taskStore,
    );

    this.eventManager = new EventManager(
      () => this.viberManager.vibers,
      () => this.taskManager.tasks,
    );

    this.viberManager = new ViberManager({
      pushSystemEvent: (evt) => this.eventManager.pushSystemEvent(evt),
      taskManager: this.taskManager,
      viberStore,
      webApiUrl: config.webApiUrl,
      webApiToken: config.webApiToken,
    });

    this.skillsManager = new SkillsManager();

    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get("/health", this.eventManager.handleHealth.bind(this.eventManager));

    this.router.get("/api/vibers", this.viberManager.handleListVibers.bind(this.viberManager));
    this.router.get("/api/vibers/:id/status", this.viberManager.handleGetViberStatus.bind(this.viberManager));
    this.router.post("/api/vibers/:id/job", this.viberManager.handlePushJobToViber.bind(this.viberManager));
    this.router.post("/api/vibers/:id/config-push", this.viberManager.handleConfigPush.bind(this.viberManager));
    this.router.post("/api/vibers/:id/skills/provision", this.viberManager.handleProvisionViberSkill.bind(this.viberManager));

    this.router.get("/api/skills", this.skillsManager.handleListSkills.bind(this.skillsManager));
    this.router.get("/api/skills/:id", (req, res) => {
      const id = (req as any).params?.id || "";
      this.skillsManager.handleGetSkill(req, res, id);
    });

    this.router.get("/api/jobs", this.eventManager.handleListAllJobs.bind(this.eventManager));
    this.router.get("/api/events", this.eventManager.handleListEvents.bind(this.eventManager));

    this.router.get("/api/tasks", this.taskManager.handleListTasks.bind(this.taskManager));
    this.router.post("/api/tasks", this.taskManager.handleCreateTask.bind(this.taskManager));
    this.router.get("/api/tasks/:id", this.taskManager.handleGetTask.bind(this.taskManager));
    this.router.post("/api/tasks/:id/message", this.taskManager.handleSendMessage.bind(this.taskManager));
    this.router.post("/api/tasks/:id/stop", this.taskManager.handleStopTask.bind(this.taskManager));
    this.router.post("/api/tasks/:id/archive", this.taskManager.handleArchiveTask.bind(this.taskManager));
    this.router.delete("/api/tasks/:id/archive", this.taskManager.handleRestoreTask.bind(this.taskManager));
    this.router.delete("/api/tasks/:id", this.taskManager.handleDeleteTask.bind(this.taskManager));
    this.router.get("/api/tasks/:id/stream", this.taskManager.handleStreamTask.bind(this.taskManager));
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.applyCors(req, res);
        if (!this.isHttpAuthorized(req)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        void this.router.handle(req, res);
      });

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
        const path = new URL(
          request.url || "/",
          `http://${request.headers.host || "localhost"}`,
        ).pathname;

        if (path === "/ws") {
          if (!this.isWebSocketAuthorized(request)) {
            socket.write("HTTP/1.1 401 Unauthorized\\r\\n\\r\\n");
            socket.destroy();
            return;
          }
          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            this.wss!.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      });

      this.wss.on("connection", (ws, req) => {
        this.viberManager.handleViberConnection(ws, req);
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
    this.viberManager.shutdown();

    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
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

  private isHttpAuthorized(req: IncomingMessage): boolean {
    if (req.method === "OPTIONS") {
      return true;
    }

    const path = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    ).pathname;

    if (path === "/health") {
      return true;
    }

    return this.isAuthorizedByToken(req.headers.authorization, req);
  }

  private isWebSocketAuthorized(req: IncomingMessage): boolean {
    const parsed = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );

    const queryToken = parsed.searchParams.get("token");
    if (queryToken && this.apiToken && queryToken === this.apiToken) {
      return true;
    }

    return this.isAuthorizedByToken(req.headers.authorization, req);
  }

  private isAuthorizedByToken(
    authorizationHeader: string | string[] | undefined,
    req: IncomingMessage,
  ): boolean {
    if (!this.apiToken) return true;

    const authHeader = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
    const bearer = this.extractBearerToken(authHeader);

    if (bearer && bearer === this.apiToken) {
      return true;
    }

    const altTokenHeader = req.headers["x-gateway-token"];
    const altToken = Array.isArray(altTokenHeader)
      ? altTokenHeader[0]
      : altTokenHeader;
    if (altToken && altToken.trim() === this.apiToken) {
      return true;
    }

    if (this.allowUnauthenticatedLocalhost && this.isLocalRequest(req)) {
      return true;
    }

    return false;
  }

  private applyCors(
    req: IncomingMessage,
    res: { setHeader: (name: string, value: string) => void },
  ): void {
    if (!this.allowedOrigins || this.allowedOrigins.size === 0) {
      return;
    }

    const origin = req.headers.origin;
    res.setHeader("Vary", "Origin");
    if (origin && this.allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      return;
    }

    if (!origin && this.allowedOrigins.size === 1) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        Array.from(this.allowedOrigins)[0]!,
      );
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "null");
  }

  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const match = header.match(/^Bearer\\s+(.+)$/i);
    return match ? match[1].trim() : null;
  }

  private isLocalRequest(req: IncomingMessage): boolean {
    const remote = req.socket.remoteAddress;
    return (
      remote === "127.0.0.1" ||
      remote === "::1" ||
      remote === "::ffff:127.0.0.1"
    );
  }
}
