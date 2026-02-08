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
import type { ViberOptions } from "../core/viber-agent";
import { runTask } from "./runtime";
import { TerminalManager } from "./terminal";
import { getOpenViberVersion } from "../utils/version";

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

export interface ViberSkillInfo {
  id: string;
  name: string;
  description: string;
}

export interface ViberInfo {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  runningTasks: string[];
  /** Skills available on this viber (from SKILL.md) */
  skills?: ViberSkillInfo[];
}

export interface ViberStatus {
  platform: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  runningTasks: number;
}

// Server -> Viber messages (messages = full chat history from Viber Board for context)
export type ControllerServerMessage =
  | {
    type: "task:submit";
    taskId: string;
    goal: string;
    options?: ViberOptions;
    messages?: { role: string; content: string }[];
  }
  | {
    type: "viber:create";
    viberId: string;
    goal: string;
    options?: ViberOptions;
    messages?: { role: string; content: string }[];
    environment?: {
      name: string;
      repoUrl?: string;
      repoOrg?: string;
      repoName?: string;
      repoBranch?: string;
      variables?: { key: string; value: string }[];
    };
  }
  | { type: "task:stop"; taskId: string }
  | { type: "viber:stop"; viberId: string }
  | {
    type: "task:message";
    taskId: string;
    message: string;
    injectionMode?: "steer" | "followup" | "collect";
  }
  | { type: "ping" }
  | { type: "config:update"; config: Partial<ViberControllerConfig> }
  // Terminal streaming messages
  | { type: "terminal:list" }
  | { type: "terminal:attach"; target: string; appId?: string }
  | { type: "terminal:detach"; target: string; appId?: string }
  | { type: "terminal:input"; target: string; keys: string; appId?: string }
  | { type: "terminal:resize"; target: string; cols: number; rows: number; appId?: string }
  | {
      type: "job:create";
      name: string;
      schedule: string;
      prompt: string;
      description?: string;
      model?: string;
      nodeId?: string;
    };

// Viber -> Server messages
export type ControllerClientMessage =
  | { type: "connected"; viber: ViberInfo }
  | { type: "task:started"; taskId: string; spaceId: string }
  | { type: "task:progress"; taskId: string; event: any }
  | { type: "task:stream-chunk"; taskId: string; chunk: string }
  | { type: "task:completed"; taskId: string; result: any }
  | { type: "task:error"; taskId: string; error: string }
  | { type: "heartbeat"; status: ViberStatus }
  | { type: "pong" }
  // Terminal streaming messages
  | { type: "terminal:list"; apps: any[]; sessions: any[]; panes: any[] }
  | { type: "terminal:attached"; target: string; appId?: string; ok: boolean; error?: string }
  | { type: "terminal:detached"; target: string; appId?: string }
  | { type: "terminal:output"; target: string; appId?: string; data: string }
  | { type: "terminal:resized"; target: string; appId?: string; ok: boolean };

interface TaskProgressEnvelope {
  eventId: string;
  sequence: number;
  taskId: string;
  conversationId: string;
  createdAt: string;
  model?: string;
  event: Record<string, unknown>;
}

interface TaskRuntimeState {
  taskId: string;
  goal: string;
  options?: ViberOptions;
  sequence: number;
  controller: AbortController;
  running: boolean;
  stopped: boolean;
  messageHistory: { role: string; content: string }[];
  queuedFollowups: string[];
  collectBuffer: string[];
  environment?: {
    name: string;
    repoUrl?: string;
    repoOrg?: string;
    repoName?: string;
    repoBranch?: string;
    variables?: { key: string; value: string }[];
  };
}

// ==================== Controller ====================

export class ViberController extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  /** taskId -> runtime state */
  private runningTasks: Map<string, TaskRuntimeState> = new Map();
  private isConnected = false;
  private shouldReconnect = true;
  /** Terminal manager for streaming tmux panes */
  private terminalManager = new TerminalManager();

  constructor(private config: ViberControllerConfig) {
    super();
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

    for (const [taskId, runtime] of this.runningTasks) {
      runtime.stopped = true;
      runtime.controller.abort();
      this.runningTasks.delete(taskId);
    }

    // Detach all terminal streams
    this.terminalManager.detachAll();

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
          "X-Viber-Version": getOpenViberVersion(),
        },
      });

      this.ws.on("open", () => {
        void this.onConnected();
      });
      this.ws.on("message", (data) => this.onMessage(data));
      this.ws.on("close", () => this.onDisconnected());
      this.ws.on("error", (err) => this.onError(err));
    } catch (error) {
      console.error("[Viber] Connection failed:", error);
      this.scheduleReconnect();
    }
  }

  private async onConnected(): Promise<void> {
    console.log("[Viber] Connected to command center");
    this.isConnected = true;

    const capabilities = ["file", "search", "web"];
    if (this.config.enableDesktop) {
      capabilities.push("desktop");
    }

    let skills: { id: string; name: string; description: string }[] = [];
    try {
      const { defaultRegistry } = await import("../skills/registry");
      await defaultRegistry.loadAll();
      const all = defaultRegistry.getAllSkills();
      skills = all.map((s) => ({
        id: s.id,
        name: s.metadata.name || s.id,
        description: s.metadata.description || "",
      }));
    } catch (err) {
      console.warn("[Viber] Could not load skills for capabilities:", err);
    }

    this.send({
      type: "connected",
      viber: {
        id: this.config.viberId,
        name: this.config.viberName || this.config.viberId,
        version: getOpenViberVersion(),
        platform: process.platform,
        capabilities,
        runningTasks: Array.from(this.runningTasks.keys()),
        skills: skills.length > 0 ? skills : undefined,
      },
    });

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

        case "viber:create":
          await this.handleTaskSubmit({
            taskId: message.viberId,
            goal: message.goal,
            options: message.options,
            messages: message.messages,
            environment: message.environment,
          });
          break;

        case "task:stop":
          await this.handleTaskStop(message.taskId);
          break;

        case "viber:stop":
          await this.handleTaskStop(message.viberId);
          break;

        case "task:message":
          await this.handleTaskMessage(
            message.taskId,
            message.message,
            message.injectionMode
          );
          break;

        case "ping":
          this.send({ type: "pong" });
          break;

        case "config:update":
          Object.assign(this.config, message.config);
          this.emit("config:update", message.config);
          break;

        // Terminal streaming
        case "terminal:list":
          this.handleTerminalList();
          break;

        case "terminal:attach":
          await this.handleTerminalAttach(message.target, message.appId);
          break;

        case "terminal:detach":
          this.handleTerminalDetach(message.target, message.appId);
          break;

        case "terminal:input":
          this.handleTerminalInput(message.target, message.keys, message.appId);
          break;

        case "terminal:resize":
          this.handleTerminalResize(message.target, message.cols, message.rows, message.appId);
          break;

        case "job:create":
          this.emit("job:create", message);
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
    messages?: { role: string; content: string }[];
    environment?: {
      name: string;
      repoUrl?: string;
      repoOrg?: string;
      repoName?: string;
      repoBranch?: string;
      variables?: { key: string; value: string }[];
    };
  }): Promise<void> {
    const { taskId, goal, options, messages, environment } = message;

    console.log(`[Viber] Received task: ${taskId}`);
    console.log(`[Viber] Goal: ${goal}`);

    const runtime: TaskRuntimeState = {
      taskId,
      goal,
      options,
      sequence: 0,
      controller: new AbortController(),
      running: false,
      stopped: false,
      messageHistory:
        messages && messages.length > 0
          ? [...messages]
          : [{ role: "user", content: goal }],
      queuedFollowups: [],
      collectBuffer: [],
      environment,
    };
    this.runningTasks.set(taskId, runtime);

    this.send({
      type: "task:started",
      taskId,
      spaceId: taskId,
    });

    try {
      let result = await this.executeTask(runtime);

      while (!runtime.stopped) {
        const nextMessage = this.dequeueNextMessage(runtime);
        if (!nextMessage) {
          break;
        }

        runtime.messageHistory.push({ role: "user", content: nextMessage });
        this.emitTaskProgress(runtime, {
          kind: "status",
          phase: "followup",
          message: "Processing follow-up intervention message",
        });
        try {
          result = await this.executeTask(runtime);
        } catch (error: any) {
          if (error?.name === "AbortError" && !runtime.stopped) {
            this.emitTaskProgress(runtime, {
              kind: "status",
              phase: "interrupted",
              message: "Run interrupted; applying latest intervention message",
            });
            continue;
          }
          throw error;
        }
      }

      if (!runtime.stopped) {
        this.send({
          type: "task:completed",
          taskId,
          result: {
            spaceId: taskId,
            text: result.finalText,
            summary: result.agent.getSummary(),
          },
        });
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.log(`[Viber] Task ${taskId} stopped`);
      } else {
        console.error(`[Viber] Task ${taskId} execution error:`, error);
        this.send({
          type: "task:error",
          taskId,
          error: error.message,
        });
      }
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  private async executeTask(
    runtime: TaskRuntimeState
  ): Promise<{ finalText: string; agent: Awaited<ReturnType<typeof runTask>>["agent"] }> {
    runtime.controller = new AbortController();
    runtime.running = true;

    const { streamResult, agent } = await runTask(
      runtime.goal,
      {
        taskId: runtime.taskId,
        model: runtime.options?.model,
        singleAgentId: runtime.options?.singleAgentId || "default",
        signal: runtime.controller.signal,
        environment: runtime.environment,
      },
      runtime.messageHistory
    );

    // Pipe the AI SDK UIMessageStream SSE bytes through to the hub,
    // so the frontend can consume them with @ai-sdk/svelte Chat class.
    const response = streamResult.toUIMessageStreamResponse();
    const body = response.body;

    if (body) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            this.send({
              type: "task:stream-chunk",
              taskId: runtime.taskId,
              chunk,
            });
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error(`[Viber] Stream read error:`, err);
          throw err;
        }
      }
    }

    // Await the final text for persistence in message history
    const finalText = await streamResult.text;

    runtime.running = false;
    runtime.messageHistory.push({ role: "assistant", content: finalText });
    return { finalText, agent };
  }

  private async handleTaskStop(taskId: string): Promise<void> {
    const runtime = this.runningTasks.get(taskId);
    if (runtime) {
      runtime.stopped = true;
      runtime.controller.abort();
      this.runningTasks.delete(taskId);
      console.log(`[Viber] Task stopped: ${taskId}`);
    }
  }

  private async handleTaskMessage(
    taskId: string,
    message: string,
    injectionMode: "steer" | "followup" | "collect" = "followup"
  ): Promise<void> {
    const runtime = this.runningTasks.get(taskId);
    if (!runtime || runtime.stopped) {
      return;
    }

    if (injectionMode === "collect") {
      runtime.collectBuffer.push(message);
      return;
    }

    if (injectionMode === "steer") {
      runtime.queuedFollowups.unshift(message);
      if (runtime.running) {
        runtime.controller.abort();
      }
      return;
    }

    runtime.queuedFollowups.push(message);
  }

  private dequeueNextMessage(runtime: TaskRuntimeState): string | null {
    const followup = runtime.queuedFollowups.shift();
    if (followup) {
      return followup;
    }

    if (runtime.collectBuffer.length > 0) {
      const merged = runtime.collectBuffer.join("\n");
      runtime.collectBuffer = [];
      return merged;
    }

    return null;
  }

  private emitTaskProgress(
    runtime: TaskRuntimeState,
    event: Record<string, unknown>
  ): void {
    const createdAt = new Date().toISOString();
    runtime.sequence += 1;
    const envelope: TaskProgressEnvelope = {
      eventId: `${runtime.taskId}-${runtime.sequence}`,
      sequence: runtime.sequence,
      taskId: runtime.taskId,
      conversationId: runtime.taskId,
      createdAt,
      model: runtime.options?.model,
      event: {
        ...event,
        at: createdAt,
      },
    };

    this.send({
      type: "task:progress",
      taskId: runtime.taskId,
      event: envelope,
    });
  }

  // ==================== Terminal Streaming ====================

  private handleTerminalList(): void {
    const { apps, sessions, panes } = this.terminalManager.list();
    this.send({ type: "terminal:list", apps, sessions, panes });
  }

  private async handleTerminalAttach(target: string, appId?: string): Promise<void> {
    console.log(`[Viber] Attaching to terminal: ${target}`);
    const ok = await this.terminalManager.attach(
      target,
      (data) => {
        this.send({ type: "terminal:output", target, appId, data });
      },
      () => {
        this.send({ type: "terminal:detached", target, appId });
      },
      appId
    );
    this.send({ type: "terminal:attached", target, appId, ok });
  }

  private handleTerminalDetach(target: string, appId?: string): void {
    console.log(`[Viber] Detaching from terminal: ${target}`);
    this.terminalManager.detach(target, appId);
    this.send({ type: "terminal:detached", target, appId });
  }

  private handleTerminalInput(target: string, keys: string, appId?: string): void {
    this.terminalManager.sendInput(target, keys, appId);
  }

  private handleTerminalResize(
    target: string,
    cols: number,
    rows: number,
    appId?: string
  ): void {
    const ok = this.terminalManager.resize(target, cols, rows, appId);
    this.send({ type: "terminal:resized", target, appId, ok });
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
