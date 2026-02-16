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
 *   GET  /api/jobs             - List all jobs across vibers
 *   GET  /api/events           - Unified event stream (activity + system)
 *   GET  /api/tasks            - List all tasks
 *   POST /api/tasks            - Create a new task on a viber
 *   GET  /api/tasks/:id        - Get task details
 *   POST /api/tasks/:id/message - Send a message to a task
 *   POST /api/tasks/:id/stop   - Stop a task
 *   GET  /api/tasks/:id/stream - SSE stream for task output
 *
 * WebSocket (for viber daemons):
 *   ws://localhost:6007/ws - Viber daemon connection endpoint
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";
import { Router } from "../utils/router";
import type { GatewayConfig } from "./types";
import { TaskManager } from "./tasks";
import { ViberManager } from "./vibers";
import { EventManager } from "./events";

export type { GatewayConfig } from "./types";

export class GatewayServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private router = new Router();

  private eventManager: EventManager;
  private taskManager: TaskManager;
  private viberManager: ViberManager;

  constructor(private config: GatewayConfig) {
    // Wire up managers with cross-references
    this.taskManager = new TaskManager(
      () => this.viberManager.vibers,
    );

    this.eventManager = new EventManager(
      () => this.viberManager.vibers,
      () => this.taskManager.tasks,
    );

    this.viberManager = new ViberManager({
      pushSystemEvent: (evt) => this.eventManager.pushSystemEvent(evt),
      taskManager: this.taskManager,
      webApiUrl: config.webApiUrl,
      webApiToken: config.webApiToken,
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get("/health", this.eventManager.handleHealth.bind(this.eventManager));

    this.router.get("/api/vibers", this.viberManager.handleListVibers.bind(this.viberManager));
    this.router.get("/api/vibers/:id/status", this.viberManager.handleGetViberStatus.bind(this.viberManager));
    this.router.post("/api/vibers/:id/job", this.viberManager.handlePushJobToViber.bind(this.viberManager));
    this.router.post("/api/vibers/:id/config-push", this.viberManager.handleConfigPush.bind(this.viberManager));
    this.router.post("/api/vibers/:id/skills/provision", this.viberManager.handleProvisionViberSkill.bind(this.viberManager));

    this.router.get("/api/jobs", this.eventManager.handleListAllJobs.bind(this.eventManager));
    this.router.get("/api/events", this.eventManager.handleListEvents.bind(this.eventManager));

    this.router.get("/api/tasks", this.taskManager.handleListTasks.bind(this.taskManager));
    this.router.post("/api/tasks", this.taskManager.handleCreateTask.bind(this.taskManager));
    this.router.get("/api/tasks/:id", this.taskManager.handleGetTask.bind(this.taskManager));
    this.router.post("/api/tasks/:id/message", this.taskManager.handleSendMessage.bind(this.taskManager));
    this.router.post("/api/tasks/:id/stop", this.taskManager.handleStopTask.bind(this.taskManager));
    this.router.get("/api/tasks/:id/stream", this.taskManager.handleStreamTask.bind(this.taskManager));
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
}
