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
import { spawnSync } from "child_process";
import type { ViberOptions } from "../viber/viber-agent";
import { runTask, appendDailyMemory } from "./runtime";
import { createLogger } from "../utils/logger";
import { TerminalManager } from "./terminal";
import { getOpenViberVersion } from "../utils/version";
import {
  collectMachineResourceStatus,
  collectViberSystemStatus,
  collectViberRunningStatus,
  type MachineResourceStatus,
  type ViberRunningStatus as ViberNodeRunningStatus,
  type RunningTaskInfo,
  type ViberSystemStatus,
  type ConfigState,
  type ConfigValidation,
} from "./telemetry";
import type { SkillHealthReport, SkillHealthResult } from "../skills/health";
import { createHash } from "crypto";
import {
  validateAllLlmKeys,
  validateAllOAuthTokens,
  validateEnvSecrets,
  type ConfigValidationResult,
} from "./config-validator";

// ==================== Types ====================

export interface ViberControllerConfig {
  /** WebSocket URL to connect to (e.g., wss://supen.app/vibers/ws) */
  serverUrl?: string;
  /** Authentication token */
  token?: string;
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
  /** Whether this skill is runnable on this node */
  available: boolean;
  /** Health check status */
  status: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
  /** Human-readable summary of health check results (e.g. "Missing: gh CLI") */
  healthSummary?: string;
  /** Full health check details with actionType for UI actions */
  checks?: Array<{
    id: string;
    label: string;
    ok: boolean;
    required?: boolean;
    message?: string;
    hint?: string;
    actionType?: "env" | "oauth" | "binary" | "auth_cli" | "manual";
  }>;
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
  /** Machine resource status snapshot (CPU, memory, disk, network) */
  machine?: MachineResourceStatus;
  /** Viber daemon running status (tasks, skills, process info) */
  viberStatus?: ViberNodeRunningStatus;
  /** Extended skill info with availability (updated periodically) */
  skills?: ViberSkillInfo[];
  /** Config sync state (version, last pull, validations) */
  configState?: import("./telemetry").ConfigState;
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
    settings?: { primaryCodingCli?: string; channelIds?: string[]; skills?: string[] };
    oauthTokens?: Record<string, { accessToken: string; refreshToken?: string | null }>;
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
  | { type: "config:push" }
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
  }
  | { type: "status:request" }
  | {
    type: "skill:provision";
    requestId: string;
    skillId: string;
    install?: boolean;
    authAction?: "none" | "copy" | "start";
  };

// Viber -> Server messages
export type ControllerClientMessage =
  | { type: "connected"; viber: ViberInfo }
  | { type: "task:started"; taskId: string; spaceId: string }
  | { type: "task:progress"; taskId: string; event: any }
  | { type: "task:stream-chunk"; taskId: string; chunk: string }
  | { type: "task:completed"; taskId: string; result: any }
  | { type: "task:error"; taskId: string; error: string; model?: string }
  | { type: "heartbeat"; status: ViberStatus }
  | { type: "pong" }
  // Terminal streaming messages
  | { type: "terminal:list"; apps: any[]; sessions: any[]; panes: any[] }
  | { type: "terminal:attached"; target: string; appId?: string; ok: boolean; error?: string }
  | { type: "terminal:detached"; target: string; appId?: string }
  | { type: "terminal:output"; target: string; appId?: string; data: string }
  | { type: "terminal:resized"; target: string; appId?: string; ok: boolean }
  | { type: "status:report"; status: ViberSystemStatus }
  | {
    type: "skill:provision-result";
    requestId: string;
    skillId: string;
    ok: boolean;
    ready: boolean;
    before?: SkillHealthResult;
    after?: SkillHealthResult;
    auth?: {
      required: boolean;
      ready: boolean;
      command?: string;
      message?: string;
    };
    installLog?: Array<{
      checkId: string;
      command: string;
      ok: boolean;
      output?: string;
    }>;
    error?: string;
  }
  | { type: "config:ack"; configVersion: string; validations: import("./telemetry").ConfigValidation[] }
  // Job reporting
  | { type: "jobs:list"; jobs: Array<{ name: string; schedule: string; prompt: string; description?: string; model?: string; nodeId?: string }> };

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
  oauthTokens?: Record<string, { accessToken: string; refreshToken?: string | null }>;
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
  /** Timestamp when the daemon started */
  private daemonStartTime: number = Date.now();
  /** Total tasks executed since daemon start */
  private totalTasksExecuted: number = 0;
  /** Skills loaded on this viber */
  private loadedSkills: string[] = [];
  /** Capabilities available */
  private loadedCapabilities: string[] = [];
  /** Timestamp of last heartbeat sent */
  private lastHeartbeatAt?: string;
  private skillHealthCache?: SkillHealthReport;
  private skillHealthCachedAt?: number;
  private skillHealthInFlight?: Promise<SkillHealthReport>;
  /** Current config state (version, last pull, validations) */
  private configState?: ConfigState;
  private log = createLogger("controller");

  constructor(private config: ViberControllerConfig) {
    super();
  }

  /**
   * Start the viber daemon
   */
  async start(): Promise<void> {
    this.log = createLogger("controller", { viberId: this.config.viberId });
    this.log.info("Starting viber", {
      serverUrl: this.config.serverUrl || "(standalone)",
    });
    this.shouldReconnect = true;

    if (!this.config.serverUrl) {
      await this.initializeLocalStatus();
      this.startHeartbeat();
      this.emit("connected");
      return;
    }

    await this.connect();
  }

  /**
   * Stop the viber daemon
   */
  async stop(): Promise<void> {
    this.log.info("Stopping viber");
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

  /**
   * Get full node observability status including machine resources and viber running status.
   */
  getNodeObservabilityStatus(): ViberSystemStatus {
    const status = collectViberSystemStatus({
      viberId: this.config.viberId,
      viberName: this.config.viberName || this.config.viberId,
      version: getOpenViberVersion(),
      connected: this.isConnected,
      daemonStartTime: this.daemonStartTime,
      runningTasks: this.getRunningTaskInfos(),
      skills: this.loadedSkills,
      capabilities: this.loadedCapabilities,
      totalTasksExecuted: this.totalTasksExecuted,
      lastHeartbeatAt: this.lastHeartbeatAt,
    });
    // Include config state if available
    if (this.configState) {
      status.configState = this.configState;
    }
    return status;
  }

  /**
   * Get running task info for observability
   */
  private getRunningTaskInfos(): RunningTaskInfo[] {
    return Array.from(this.runningTasks.values()).map((rt) => ({
      taskId: rt.taskId,
      goal: rt.goal,
      model: rt.options?.model,
      isRunning: rt.running,
      messageCount: rt.messageHistory.length,
    }));
  }

  // ==================== Connection Management ====================

  private async connect(): Promise<void> {
    if (!this.config.serverUrl) {
      this.log.info("No command center configured; running in standalone mode");
      return;
    }

    try {
      this.ws = new WebSocket(this.config.serverUrl, {
        headers: {
          Authorization: `Bearer ${this.config.token || ""}`,
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
      this.log.error("Connection failed", { error: String(error) });
      this.scheduleReconnect();
    }
  }

  private async onConnected(): Promise<void> {
    this.log.info("Connected to command center");
    this.isConnected = true;

    const { capabilities, skills } = await this.initializeLocalStatus();

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

  /**
   * Load local capabilities and skill metadata/health for status reporting.
   */
  private async initializeLocalStatus(): Promise<{ capabilities: string[]; skills: ViberSkillInfo[] }> {

    const capabilities = ["file", "search", "web"];
    if (this.config.enableDesktop) {
      capabilities.push("desktop");
    }

    let skills: ViberSkillInfo[] = [];
    try {
      const { defaultRegistry } = await import("../skills/registry");
      await defaultRegistry.loadAll();
      const all = defaultRegistry.getAllSkills();

      // Run health checks to determine skill availability
      const { checkSkillsHealth } = await import("../skills/health");
      const skillInfos = all.map((s) => ({
        id: s.id,
        name: s.metadata.name || s.id,
        description: s.metadata.description || "",
      }));
      const healthReport = await checkSkillsHealth(skillInfos);
      // Cache the report so heartbeat can reuse it
      this.skillHealthCache = healthReport;
      this.skillHealthCachedAt = Date.now();

      const healthMap = new Map(healthReport.skills.map((r) => [r.id, r]));

      skills = all.map((s) => {
        const health = healthMap.get(s.id);
        return {
          id: s.id,
          name: s.metadata.name || s.id,
          description: s.metadata.description || "",
          available: health?.available ?? false,
          status: health?.status ?? "UNKNOWN",
          healthSummary: health?.summary,
        };
      });
    } catch (err) {
      this.log.warn("Could not load skills for capabilities", { error: String(err) });
    }

    // Store loaded capabilities and skills for status reporting
    this.loadedCapabilities = capabilities;
    this.loadedSkills = skills.map((s) => s.id);

    return { capabilities, skills };
  }

  private onDisconnected(): void {
    this.log.info("Disconnected from command center");
    this.isConnected = false;
    this.stopHeartbeat();

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }

    this.emit("disconnected");
  }

  private onError(error: Error): void {
    this.log.error("WebSocket error", { error: error.message });
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
            options: { ...message.options, settings: message.settings },
            messages: message.messages,
            environment: message.environment,
            oauthTokens: message.oauthTokens,
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

        case "config:push":
          await this.handleConfigPush();
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

        case "status:request":
          await this.handleStatusRequest();
          break;

        case "skill:provision":
          await this.handleSkillProvision(message);
          break;
      }
    } catch (error) {
      this.log.error("Failed to process message", { error: String(error) });
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
    oauthTokens?: Record<string, { accessToken: string; refreshToken?: string | null }>;
  }): Promise<void> {
    const { taskId, goal, options, messages, environment, oauthTokens } = message;

    const taskLog = this.log.child({ taskId });
    taskLog.info("Received task", { goal });

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
      oauthTokens,
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
        const summary = result.agent.getSummary();
        this.send({
          type: "task:completed",
          taskId,
          result: {
            spaceId: taskId,
            text: result.finalText,
            summary,
          },
        });
        // Append to daily memory log
        await appendDailyMemory(this.config.viberId, {
          taskId,
          goal,
          outcome: "completed",
          details: typeof summary === "string" ? summary : JSON.stringify(summary),
        });
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        taskLog.info("Task stopped");
        await appendDailyMemory(this.config.viberId, {
          taskId, goal, outcome: "stopped",
        });
      } else {
        const model = (runtime as any)._resolvedModel || options?.model || "default";
        taskLog.error("Task execution error", { error: error.message, model });
        this.send({
          type: "task:error",
          taskId,
          error: error.message,
          model,
        });
        await appendDailyMemory(this.config.viberId, {
          taskId, goal, outcome: "error", details: `[model: ${model}] ${error.message}`,
        });
      }
    } finally {
      this.runningTasks.delete(taskId);
      this.totalTasksExecuted++;
    }
  }

  private async executeTask(
    runtime: TaskRuntimeState
  ): Promise<{ finalText: string; agent: Awaited<ReturnType<typeof runTask>>["agent"] }> {
    runtime.controller = new AbortController();
    runtime.running = true;

    // Create progress callback for tools to emit intermediate updates
    const onProgress = (event: {
      kind: string;
      phase?: string;
      message?: string;
      data?: any;
    }) => {
      this.emitTaskProgress(runtime, event);
    };

    const { streamResult, agent } = await runTask(
      runtime.goal,
      {
        taskId: runtime.taskId,
        model: runtime.options?.model,
        singleAgentId: runtime.options?.singleAgentId || "default",
        signal: runtime.controller.signal,
        environment: runtime.environment,
        settingsOverride: runtime.options?.settings,
        oauthTokens: runtime.oauthTokens,
        onProgress,
      },
      runtime.messageHistory
    );

    // Store the resolved model on the runtime so error handlers can reference it
    (runtime as any)._resolvedModel = `${agent.provider}/${agent.model}`;

    // Pipe the AI SDK UIMessageStream SSE bytes through to the hub,
    // so the frontend can consume them with @ai-sdk/svelte Chat class.
    const response = streamResult.toUIMessageStreamResponse();
    const body = response.body;

    // Capture any stream-level error from the AI SDK (e.g. APICallError).
    // The SDK embeds these as `{"type":"error","errorText":"..."}` SSE chunks
    // before closing the stream, which means `streamResult.text` rejects with
    // a generic "No output generated" error and the real message is lost.
    let streamErrorText: string | undefined;

    if (body) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            // Detect error chunks from the AI SDK UI message stream
            // Format: data: {"type":"error","errorText":"..."}
            if (!streamErrorText) {
              const errorMatch = chunk.match(/"type"\s*:\s*"error"\s*,\s*"errorText"\s*:\s*"([^"]*)"/);
              if (errorMatch) {
                streamErrorText = errorMatch[1];
              }
            }
            this.send({
              type: "task:stream-chunk",
              taskId: runtime.taskId,
              chunk,
            });
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          this.log.error("Stream read error", { taskId: runtime.taskId, error: String(err) });
          throw err;
        }
      }
    }

    // Await the final text for persistence in message history.
    // If the stream contained an error, `streamResult.text` will reject with
    // a generic NoOutputGeneratedError. In that case, re-throw with the
    // actual error captured from the stream so callers see the real reason.
    let finalText: string;
    try {
      finalText = await streamResult.text;
    } catch (textError: any) {
      if (streamErrorText) {
        const enriched = new Error(streamErrorText);
        enriched.name = textError?.name || "StreamError";
        throw enriched;
      }
      throw textError;
    }

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
      this.log.info("Task stopped", { taskId });
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

  // ==================== Status Reporting ====================

  private async handleStatusRequest(): Promise<void> {
    const status = this.getNodeObservabilityStatus();
    const report = await this.getSkillHealthReport();
    if (report && status.viber) {
      status.viber.skillHealth = report;
    }
    this.send({ type: "status:report", status });
  }

  private async getSkillHealthResult(skillId: string): Promise<SkillHealthResult | null> {
    try {
      const { checkSkillHealth } = await import("../skills/health");
      return await checkSkillHealth({ id: skillId, name: skillId });
    } catch (error) {
      this.log.warn("Failed to run skill health check", {
        skillId,
        error: String(error),
      });
      return null;
    }
  }

  private getProvisionInstallCommand(skillId: string, checkId: string): string | null {
    if (checkId === "tmux") {
      if (process.platform === "darwin") return "brew install tmux";
      if (process.platform === "linux") {
        return "sudo apt-get update && sudo apt-get install -y tmux";
      }
      return null;
    }

    if (skillId === "cursor-agent" && checkId === "cursor-cli") {
      return "curl https://cursor.com/install -fsS | bash";
    }
    if (skillId === "codex-cli" && checkId === "codex-cli") {
      return "pnpm add -g @openai/codex";
    }
    if (skillId === "gemini-cli" && checkId === "gemini-cli") {
      return "npm install -g @google/gemini-cli";
    }
    if (skillId === "github" && checkId === "gh-cli") {
      if (process.platform === "darwin") return "brew install gh";
      if (process.platform === "linux") {
        return "sudo apt-get update && sudo apt-get install -y gh";
      }
      return null;
    }
    if (skillId === "railway" && checkId === "railway-cli") {
      return "npm install -g @railway/cli";
    }
    return null;
  }

  private getProvisionAuthCommand(skillId: string, checkId: string): string | undefined {
    if (skillId === "cursor-agent" && checkId === "cursor-auth") {
      return "agent login || cursor-agent login";
    }
    if (skillId === "codex-cli" && checkId === "codex-auth") {
      return "codex login";
    }
    if (skillId === "gemini-cli" && checkId === "gemini-auth") {
      return "gemini";
    }
    if (skillId === "github" && checkId === "gh-auth") {
      return "gh auth login -h github.com";
    }
    if (skillId === "railway" && checkId === "railway-auth") {
      return "railway login";
    }
    if (skillId === "gmail" && checkId === "google-oauth") {
      return "openviber auth google || viber auth google";
    }
    return undefined;
  }

  private runProvisionCommand(
    command: string,
    timeoutMs: number = 10 * 60 * 1000,
  ): { ok: boolean; output: string } {
    const result = spawnSync(command, {
      shell: true,
      encoding: "utf8",
      stdio: "pipe",
      timeout: timeoutMs,
    });
    const stdout = result.stdout ? String(result.stdout) : "";
    const stderr = result.stderr ? String(result.stderr) : "";
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    if (result.error) {
      return {
        ok: false,
        output:
          output ||
          result.error.message ||
          "Command failed to start.",
      };
    }
    return {
      ok: (result.status ?? 1) === 0,
      output,
    };
  }

  private async handleSkillProvision(message: {
    requestId: string;
    skillId: string;
    install?: boolean;
    authAction?: "none" | "copy" | "start";
  }): Promise<void> {
    const skillId = String(message.skillId || "").trim();
    if (!skillId) {
      this.send({
        type: "skill:provision-result",
        requestId: message.requestId,
        skillId: "",
        ok: false,
        ready: false,
        error: "Missing skillId",
      });
      return;
    }

    const before = await this.getSkillHealthResult(skillId);
    if (!before) {
      this.send({
        type: "skill:provision-result",
        requestId: message.requestId,
        skillId,
        ok: false,
        ready: false,
        error: `Failed to read health status for ${skillId}`,
      });
      return;
    }

    const installLog: Array<{
      checkId: string;
      command: string;
      ok: boolean;
      output?: string;
    }> = [];

    if (before.available) {
      this.send({
        type: "skill:provision-result",
        requestId: message.requestId,
        skillId,
        ok: true,
        ready: true,
        before,
        after: before,
        auth: {
          required: false,
          ready: true,
        },
        installLog,
      });
      return;
    }

    if (message.install) {
      const binaryChecks = before.checks.filter(
        (check) =>
          (check.required ?? true) &&
          !check.ok &&
          check.actionType === "binary",
      );

      for (const check of binaryChecks) {
        const command = this.getProvisionInstallCommand(skillId, check.id);
        if (!command) continue;
        const installResult = this.runProvisionCommand(command);
        installLog.push({
          checkId: check.id,
          command,
          ok: installResult.ok,
          output: installResult.output.slice(0, 1200),
        });
      }
    }

    let after = await this.getSkillHealthResult(skillId);
    if (!after) {
      after = before;
    }

    const authCheck = after.checks.find(
      (check) =>
        (check.required ?? true) &&
        !check.ok &&
        (check.actionType === "auth_cli" || check.actionType === "oauth"),
    );

    let auth: {
      required: boolean;
      ready: boolean;
      command?: string;
      message?: string;
    } = {
      required: false,
      ready: true,
    };

    if (authCheck) {
      const authCommand = this.getProvisionAuthCommand(skillId, authCheck.id);
      auth = {
        required: true,
        ready: false,
        command:
          message.authAction === "copy" || message.authAction === "start"
            ? authCommand
            : undefined,
        message: authCheck.hint || authCheck.message || "Authentication is required.",
      };

      // "start" currently performs a non-interactive kickoff attempt.
      // Many CLI auth flows still need user interaction in terminal/browser.
      if (message.authAction === "start" && authCommand) {
        const kickoff = this.runProvisionCommand(authCommand, 20_000);
        installLog.push({
          checkId: authCheck.id,
          command: authCommand,
          ok: kickoff.ok,
          output: kickoff.output.slice(0, 1200),
        });
        const refreshed = await this.getSkillHealthResult(skillId);
        if (refreshed) {
          after = refreshed;
          if (refreshed.available) {
            auth = {
              required: true,
              ready: true,
            };
          }
        }
      }
    }

    this.send({
      type: "skill:provision-result",
      requestId: message.requestId,
      skillId,
      ok: true,
      ready: after.available,
      before,
      after,
      auth,
      installLog,
    });
  }

  /**
   * Build extended skill info array with availability from the cached health report.
   * Uses the cached report (refreshes if stale) to annotate each loaded skill.
   */
  private async buildSkillsWithHealth(): Promise<ViberSkillInfo[]> {
    try {
      const { defaultRegistry } = await import("../skills/registry");
      const all = defaultRegistry.getAllSkills();
      const report = await this.getSkillHealthReport();
      const healthMap = report
        ? new Map(report.skills.map((r) => [r.id, r]))
        : new Map();

      return all.map((s) => {
        const health = healthMap.get(s.id);
        return {
          id: s.id,
          name: s.metadata.name || s.id,
          description: s.metadata.description || "",
          available: health?.available ?? false,
          status: (health?.status ?? "UNKNOWN") as ViberSkillInfo["status"],
          healthSummary: health?.summary,
          checks: health?.checks?.map((c: import("../skills/health").SkillHealthCheck) => ({
            id: c.id,
            label: c.label,
            ok: c.ok,
            required: c.required,
            message: c.message,
            hint: c.hint,
            actionType: c.actionType,
          })),
        };
      });
    } catch (err) {
      this.log.warn("Could not build skills with health info", { error: String(err) });
      return [];
    }
  }

  private async getSkillHealthReport(): Promise<SkillHealthReport | undefined> {
    const now = Date.now();
    const maxAgeMs = 60_000;
    if (
      this.skillHealthCache &&
      this.skillHealthCachedAt &&
      now - this.skillHealthCachedAt < maxAgeMs
    ) {
      return this.skillHealthCache;
    }

    const refresh = this.refreshSkillHealth();
    const timeout = new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), 4000);
    });

    try {
      const result = await Promise.race([refresh, timeout]);
      if (result) {
        return result;
      }
    } catch (err: any) {
      this.log.warn("Failed to collect skill health report", {
        error: String(err?.message || err),
      });
    }

    return this.skillHealthCache;
  }

  private async refreshSkillHealth(): Promise<SkillHealthReport> {
    if (this.skillHealthInFlight) {
      return this.skillHealthInFlight;
    }

    this.skillHealthInFlight = (async () => {
      const { getSkillHealthReport } = await import("../skills/health");
      const report = await getSkillHealthReport();
      this.skillHealthCache = report;
      this.skillHealthCachedAt = Date.now();
      return report;
    })();

    try {
      return await this.skillHealthInFlight;
    } finally {
      this.skillHealthInFlight = undefined;
    }
  }

  // ==================== Terminal Streaming ====================

  private handleTerminalList(): void {
    const { apps, sessions, panes } = this.terminalManager.list();
    this.send({ type: "terminal:list", apps, sessions, panes });
  }

  private async handleTerminalAttach(target: string, appId?: string): Promise<void> {
    this.log.info("Attaching to terminal", { target });
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
    this.log.info("Detaching from terminal", { target });
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

  // ==================== Job Reporting ====================

  /**
   * Report the daemon's loaded job list to the hub so the web can observe all jobs.
   * Called after the scheduler loads/reloads jobs.
   */
  reportJobs(jobs: Array<{ name: string; schedule: string; prompt: string; description?: string; model?: string; nodeId?: string }>): void {
    this.send({ type: "jobs:list", jobs });
  }

  // ==================== Config Sync ====================

  /**
   * Compute a hash of the current config for version tracking.
   */
  private computeConfigVersion(config: Record<string, unknown>): string {
    const json = JSON.stringify(config, Object.keys(config).sort());
    return createHash("sha256").update(json).digest("hex").slice(0, 16);
  }

  /**
   * Collect current config state (version, last pull, validations).
   * This will be populated when config is pulled and validated.
   */
  private getConfigState(): ConfigState | undefined {
    return this.configState;
  }

  /**
   * Get web API base URL from gateway URL or environment variable.
   */
  private getWebApiUrl(): string | null {
    // Try environment variable first
    if (process.env.OPENVIBER_WEB_API_URL) {
      return process.env.OPENVIBER_WEB_API_URL;
    }

    // Derive from gateway URL if available
    if (this.config.serverUrl) {
      try {
        const gatewayUrl = new URL(this.config.serverUrl);
        // Replace ws:// with http:// or wss:// with https://
        const protocol = gatewayUrl.protocol === "wss:" ? "https:" : "http:";
        // Default web port is 6006 (gateway is 6007)
        const port = gatewayUrl.port === "6007" ? "6006" : gatewayUrl.port;
        return `${protocol}//${gatewayUrl.hostname}${port ? `:${port}` : ""}`;
      } catch {
        // Invalid URL, return null
      }
    }

    return null;
  }

  /**
   * Handle config:push message from gateway.
   * Pulls latest config, validates it, and sends config:ack.
   */
  private async handleConfigPush(): Promise<void> {
    this.log.info("Received config:push, pulling latest config");
    try {
      const now = new Date().toISOString();
      const validations: ConfigValidation[] = [];

      // Pull config from web API
      const webApiUrl = this.getWebApiUrl();
      if (!webApiUrl || !this.config.token) {
        this.log.warn("Cannot pull config: web API URL or auth token not available");
        // Fall back to validating environment variables
        const envLlmKeys: Record<string, { apiKey?: string; baseUrl?: string }> = {};
        if (process.env.ANTHROPIC_API_KEY) {
          envLlmKeys.anthropic = { apiKey: process.env.ANTHROPIC_API_KEY };
        }
        if (process.env.OPENAI_API_KEY) {
          envLlmKeys.openai = { apiKey: process.env.OPENAI_API_KEY };
        }
        if (process.env.OPENROUTER_API_KEY) {
          envLlmKeys.openrouter = { apiKey: process.env.OPENROUTER_API_KEY };
        }

        if (Object.keys(envLlmKeys).length > 0) {
          const llmResults = await validateAllLlmKeys(envLlmKeys);
          validations.push(
            ...llmResults.map((r: ConfigValidationResult) => ({
              ...r,
              checkedAt: now,
            })),
          );
        }

        const configVersion = this.configState?.configVersion || this.computeConfigVersion(envLlmKeys);
        this.configState = {
          configVersion,
          lastConfigPullAt: now,
          validations,
        };

        this.send({
          type: "config:ack",
          configVersion,
          validations,
        });
        return;
      }

      // Call web API to get config
      const configUrl = `${webApiUrl}/api/nodes/${encodeURIComponent(this.config.viberId)}/config`;
      const response = await fetch(configUrl, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        throw new Error(`Config API returned ${response.status}: ${response.statusText}`);
      }

      const configData = await response.json();
      const pulledConfig = configData.config || {};
      const aiProviders = configData.globalSettings?.aiProviders || {};
      const oauthConnections = configData.oauthConnections || [];

      // Validate LLM keys
      if (Object.keys(aiProviders).length > 0) {
        const llmResults = await validateAllLlmKeys(aiProviders);
        validations.push(
          ...llmResults.map((r: ConfigValidationResult) => ({
            ...r,
            checkedAt: now,
          })),
        );
      }

      // Validate OAuth tokens
      if (oauthConnections.length > 0) {
        const oauthResults = await validateAllOAuthTokens(oauthConnections);
        validations.push(
          ...oauthResults.map((r: ConfigValidationResult) => ({
            ...r,
            checkedAt: now,
          })),
        );
      }

      // Compute config version from pulled config
      const configVersion = this.computeConfigVersion({
        config: pulledConfig,
        aiProviders,
        oauthConnections: oauthConnections.map((c: any) => ({
          provider: c.provider,
          expiresAt: c.expiresAt,
        })),
      });

      this.configState = {
        configVersion,
        lastConfigPullAt: now,
        validations,
      };

      // Send acknowledgment
      this.send({
        type: "config:ack",
        configVersion,
        validations,
      });

      this.log.info("Config pulled and validated", {
        configVersion,
        validationCount: validations.length,
      });
    } catch (error) {
      this.log.error("Failed to handle config push", { error: String(error) });
      // Send ack with failed status
      const validations: ConfigValidation[] = [
        {
          category: "llm_keys",
          status: "failed",
          message: `Config pull failed: ${error instanceof Error ? error.message : String(error)}`,
          checkedAt: new Date().toISOString(),
        },
      ];
      this.send({
        type: "config:ack",
        configVersion: this.configState?.configVersion || "unknown",
        validations,
      });
    }
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
    this.heartbeatTimer = setInterval(async () => {
      const machineStatus = collectMachineResourceStatus();
      const viberStatus = collectViberRunningStatus({
        viberId: this.config.viberId,
        viberName: this.config.viberName || this.config.viberId,
        version: getOpenViberVersion(),
        connected: this.isConnected,
        daemonStartTime: this.daemonStartTime,
        runningTasks: this.getRunningTaskInfos(),
        skills: this.loadedSkills,
        capabilities: this.loadedCapabilities,
        totalTasksExecuted: this.totalTasksExecuted,
        lastHeartbeatAt: this.lastHeartbeatAt,
      });

      // Build extended skill info from cached health report
      const skillsWithHealth = await this.buildSkillsWithHealth();

      const status: ViberStatus = {
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        runningTasks: this.runningTasks.size,
        machine: machineStatus,
        viberStatus,
        skills: skillsWithHealth.length > 0 ? skillsWithHealth : undefined,
        configState: this.getConfigState(),
      };

      this.lastHeartbeatAt = new Date().toISOString();
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
    if (!this.shouldReconnect || !this.config.serverUrl) return;

    const interval = this.config.reconnectInterval || 5000;
    this.log.info("Reconnecting", { intervalMs: interval });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, interval);
  }
}
