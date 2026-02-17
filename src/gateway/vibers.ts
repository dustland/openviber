/**
 * Viber Manager — manages connected viber daemons over WebSocket.
 *
 * Handles connection lifecycle, heartbeat, status, config push,
 * skill provisioning, and job push for connected vibers.
 */

import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import type { WebSocket } from "ws";
import { readJsonBody } from "../utils/router";
import type { ViberSystemStatus } from "./types";
import type {
  ConnectedViber,
  SystemEvent,
  JobEntry,
} from "./types";
import type { TaskManager } from "./tasks";
import type { GatewayViberStore } from "./viber-store";

export interface ViberManagerDeps {
  pushSystemEvent: (evt: Omit<SystemEvent, "at" | "category">) => void;
  taskManager: TaskManager;
  viberStore: GatewayViberStore;
  webApiUrl?: string;
  webApiToken?: string;
}

export class ViberManager {
  readonly vibers: Map<string, ConnectedViber> = new Map();
  /** In-flight skill provisioning requests waiting for viber replies */
  private pendingSkillProvisionResolvers: Map<
    string,
    { resolve: (payload: any) => void; timeout: NodeJS.Timeout }
  > = new Map();

  constructor(private deps: ViberManagerDeps) { }

  // ==================== HTTP Handlers ====================

  async handleListVibers(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const liveVibers = Array.from(this.vibers.values()).map((n) => ({
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

    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const includeOffline = url.searchParams.get("includeOffline") === "true";

    let vibers = liveVibers;
    if (includeOffline) {
      try {
        const persisted = await this.deps.viberStore.listVibers();
        const liveById = new Map(liveVibers.map((row) => [row.id, row]));

        const offlineRows = persisted
          .filter((row) => !liveById.has(row.id))
          .map((row) => ({
            id: row.id,
            name: row.name,
            version: row.version,
            platform: row.platform,
            capabilities: row.capabilities,
            skills: [],
            connectedAt: row.connectedAt ?? row.updatedAt,
            lastHeartbeat: row.lastHeartbeatAt ?? row.updatedAt,
            runningVibers: [],
            machine: undefined,
            viber: undefined,
            offline: true,
            lastDisconnectedAt: row.lastDisconnectedAt,
          }));

        vibers = [...liveVibers, ...offlineRows];
      } catch (error) {
        console.warn("[Gateway] Failed to load persisted vibers:", error);
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: true, vibers }));
  }

  handleGetViberStatus(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): void {
    const viberId = params.id;
    const connectedViber = this.vibers.get(viberId);
    if (!connectedViber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found or not connected" }));
      return;
    }

    // If we have recent heartbeat data (within 60s), combine and return it
    const heartbeatAge = Date.now() - connectedViber.lastHeartbeat.getTime();

    if (
      connectedViber.machineStatus &&
      connectedViber.viberStatus &&
      heartbeatAge < 60_000 &&
      connectedViber.viberStatus.skillHealth
    ) {
      const status: ViberSystemStatus = {
        machine: connectedViber.machineStatus,
        viber: connectedViber.viberStatus,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ viberId, status, source: "heartbeat-cache" }));
      return;
    }

    // Request fresh status from the viber with a timeout
    if (!connectedViber.pendingStatusResolvers) {
      connectedViber.pendingStatusResolvers = [];
    }

    const timeout = setTimeout(() => {
      const idx = connectedViber.pendingStatusResolvers?.indexOf(resolver);
      if (idx !== undefined && idx >= 0) {
        connectedViber.pendingStatusResolvers?.splice(idx, 1);
      }

      if (connectedViber.machineStatus || connectedViber.viberStatus) {
        const status: Partial<ViberSystemStatus> = {};
        if (connectedViber.machineStatus)
          status.machine = connectedViber.machineStatus;
        if (connectedViber.viberStatus)
          status.viber = connectedViber.viberStatus;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ viberId, status, source: "heartbeat-stale" }),
        );
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

    connectedViber.pendingStatusResolvers.push(resolver);
    connectedViber.ws.send(JSON.stringify({ type: "status:request" }));
  }

  async handlePushJobToViber(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    const viberId = params.id;
    const connectedViber = this.vibers.get(viberId);
    if (!connectedViber) {
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
      connectedViber.ws.send(JSON.stringify(message));
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

  async handleProvisionViberSkill(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    const viberId = params.id;
    const connectedViber = this.vibers.get(viberId);
    if (!connectedViber) {
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

      requestId = String(
        parsed.requestId ||
        `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      );
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

      connectedViber.ws.send(
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
        const pending =
          this.pendingSkillProvisionResolvers.get(requestId);
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

  handleConfigPush(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): void {
    const viberId = params.id;
    const connectedViber = this.vibers.get(viberId);
    if (!connectedViber) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Viber not found or not connected" }));
      return;
    }

    try {
      connectedViber.ws.send(JSON.stringify({ type: "config:push" }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, message: "Config push sent to viber" }),
      );
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to push config",
        }),
      );
    }
  }

  // ==================== WebSocket Lifecycle ====================

  handleViberConnection(ws: WebSocket, req: IncomingMessage): void {
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
      for (const [id, connectedViber] of this.vibers) {
        if (connectedViber.ws === ws) {
          console.log(`[Gateway] Viber disconnected: ${id}`);
          void this.deps.viberStore.markDisconnected(id).catch((error) => {
            console.warn(
              `[Gateway] Failed to persist viber disconnect (${id}):`,
              error,
            );
          });
          this.deps.pushSystemEvent({
            component: "viber",
            level: "warn",
            message: `Viber disconnected: ${connectedViber.name}`,
            viberId: id,
            viberName: connectedViber.name,
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
    const tm = this.deps.taskManager;
    switch (msg.type) {
      case "connected":
        this.handleViberConnected(ws, msg.viber);
        break;

      case "viber:started":
      case "task:started":
        tm.handleTaskStarted(msg.viberId || msg.taskId);
        break;

      case "viber:progress":
      case "task:progress":
        tm.handleTaskProgress(msg.viberId || msg.taskId, msg.event);
        break;

      case "viber:stream-chunk":
      case "task:stream-chunk":
        tm.handleStreamChunk(msg.viberId || msg.taskId, msg.chunk);
        break;

      case "viber:completed":
      case "task:completed":
        tm.handleTaskCompleted(msg.viberId || msg.taskId, msg.result);
        break;

      case "viber:error":
      case "task:error":
        tm.handleTaskError(
          msg.viberId || msg.taskId,
          msg.error,
          msg.model,
        );
        break;

      case "heartbeat":
        this.handleHeartbeat(ws, msg.status);
        break;

      case "pong":
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
        break;

      case "config:ack":
        this.handleConfigAck(ws, msg.configVersion, msg.validations);
        break;

      default:
        console.log(`[Gateway] Unknown message type: ${msg.type}`);
    }
  }

  private handleViberConnected(ws: WebSocket, viberInfo: any): void {
    console.log(
      `[Gateway] Viber registered: ${viberInfo.id} (${viberInfo.name})`,
    );

    this.vibers.set(viberInfo.id, {
      id: viberInfo.id,
      name: viberInfo.name,
      version: viberInfo.version,
      platform: viberInfo.platform,
      capabilities: viberInfo.capabilities || [],
      skills: viberInfo.skills,
      ws,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      runningVibers: viberInfo.runningTasks || [],
      jobs: [],
    });

    void this.deps.viberStore
      .upsertConnected({
        id: viberInfo.id,
        name: viberInfo.name,
        version: viberInfo.version,
        platform: viberInfo.platform,
        capabilities: viberInfo.capabilities || [],
      })
      .catch((error) => {
        console.warn(
          `[Gateway] Failed to persist viber connection (${viberInfo.id}):`,
          error,
        );
      });

    this.deps.pushSystemEvent({
      component: "viber",
      level: "info",
      message: `Viber connected: ${viberInfo.name}`,
      viberId: viberInfo.id,
      viberName: viberInfo.name,
      metadata: {
        version: viberInfo.version,
        platform: viberInfo.platform,
        capabilities: viberInfo.capabilities,
        skillCount: viberInfo.skills?.length ?? 0,
      },
    });
  }

  private handleHeartbeat(ws: WebSocket, heartbeatStatus?: any): void {
    for (const connectedViber of this.vibers.values()) {
      if (connectedViber.ws === ws) {
        connectedViber.lastHeartbeat = new Date();
        void this.deps.viberStore
          .touchHeartbeat(
            connectedViber.id,
            connectedViber.lastHeartbeat.toISOString(),
          )
          .catch((error) => {
            console.warn(
              `[Gateway] Failed to persist heartbeat (${connectedViber.id}):`,
              error,
            );
          });

        if (heartbeatStatus) {
          if (heartbeatStatus.machine) {
            connectedViber.machineStatus = heartbeatStatus.machine;
          }
          if (heartbeatStatus.viberStatus) {
            connectedViber.viberStatus = heartbeatStatus.viberStatus;
          }
          if (heartbeatStatus.skills) {
            connectedViber.skills = heartbeatStatus.skills;
          }
        }

        break;
      }
    }
  }

  private handleStatusReport(
    ws: WebSocket,
    status: ViberSystemStatus,
  ): void {
    for (const connectedViber of this.vibers.values()) {
      if (connectedViber.ws === ws) {
        connectedViber.lastHeartbeat = new Date();
        void this.deps.viberStore
          .touchHeartbeat(
            connectedViber.id,
            connectedViber.lastHeartbeat.toISOString(),
          )
          .catch((error) => {
            console.warn(
              `[Gateway] Failed to persist status heartbeat (${connectedViber.id}):`,
              error,
            );
          });

        if (status.machine) {
          connectedViber.machineStatus = status.machine;
        }
        if (status.viber) {
          connectedViber.viberStatus = status.viber;
        }

        if (
          connectedViber.pendingStatusResolvers &&
          connectedViber.pendingStatusResolvers.length > 0
        ) {
          for (const resolver of connectedViber.pendingStatusResolvers) {
            resolver(status);
          }
          connectedViber.pendingStatusResolvers = [];
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

  private handleViberJobsList(ws: WebSocket, jobs: JobEntry[]): void {
    for (const connectedViber of this.vibers.values()) {
      if (connectedViber.ws === ws) {
        connectedViber.jobs = Array.isArray(jobs) ? jobs : [];
        console.log(
          `[Gateway] Viber ${connectedViber.id} reported ${connectedViber.jobs.length} job(s)`,
        );
        break;
      }
    }
  }

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
    for (const connectedViber of this.vibers.values()) {
      if (connectedViber.ws === ws) {
        console.log(
          `[Gateway] Viber ${connectedViber.id} acknowledged config push: version=${configVersion}, validations=${validations.length}`,
        );

        // Persist config sync state to Supabase via web API
        const webApiUrl =
          this.deps.webApiUrl || process.env.OPENVIBER_WEB_API_URL;
        const webApiToken =
          this.deps.webApiToken || process.env.VIBER_GATEWAY_API_TOKEN;

        if (webApiUrl && webApiToken) {
          const syncState = {
            configVersion,
            lastConfigPullAt: new Date().toISOString(),
            validations,
          };

          fetch(
            `${webApiUrl}/api/vibers/${encodeURIComponent(connectedViber.id)}/config-sync-state`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${webApiToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ config_sync_state: syncState }),
            },
          ).catch((error) => {
            console.error(
              `[Gateway] Failed to persist config sync state for viber ${connectedViber.id}:`,
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

  /** Clean up on shutdown */
  shutdown(): void {
    for (const connectedViber of this.vibers.values()) {
      connectedViber.ws.close();
    }
    this.vibers.clear();
    for (const pending of this.pendingSkillProvisionResolvers.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingSkillProvisionResolvers.clear();
  }
}
