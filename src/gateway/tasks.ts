/**
 * Task Manager — handles task CRUD, streaming, and progress lifecycle.
 */

import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { readJsonBody } from "../utils/router";
import type {
  ConnectedViber,
  GatewayTask,
  TaskProgressEnvelope,
} from "./types";
import type {
  GatewayTaskStore,
  PersistedGatewayTask,
} from "./task-store";

const MAX_STREAM_BUFFER_BYTES = 2_000_000;

interface TaskCreateMetadata {
  userId?: string;
  environmentId?: string | null;
  title?: string;
  config?: Record<string, unknown>;
}

interface TaskListQuery {
  userId?: string;
  includeArchived: boolean;
}

interface TaskSummaryResponse {
  id: string;
  userId: string | null;
  viberId: string | null;
  viberName: string | null;
  goal: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  environmentId: string | null;
  eventCount: number;
  partialText?: string;
  isConnected: boolean;
  error: string | null;
}

interface TaskDetailResponse extends TaskSummaryResponse {
  result: unknown;
  events: Array<{ at: string; event: unknown }>;
}

export class TaskManager {
  readonly tasks: Map<string, GatewayTask> = new Map();
  /** Active SSE stream subscribers per task. */
  private streamSubscribers: Map<string, ServerResponse[]> = new Map();

  constructor(
    private readonly getVibers: () => Map<string, ConnectedViber>,
    private readonly taskStore: GatewayTaskStore,
  ) {}

  // ==================== HTTP Handlers ====================

  async handleListTasks(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const query = this.readTaskListQuery(req);
      const persisted = await this.taskStore.listTasks({
        userId: query.userId,
        includeArchived: query.includeArchived,
      });

      const persistedById = new Map(persisted.map((row) => [row.id, row]));
      const tasks = persisted.map((row) =>
        this.toTaskSummary(this.tasks.get(row.id), row),
      );

      // Include in-memory tasks that are not persisted yet (fallback behavior).
      if (!query.userId) {
        for (const live of this.tasks.values()) {
          if (!persistedById.has(live.id)) {
            tasks.push(this.toTaskSummary(live));
          }
        }
      }

      tasks.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tasks }));
    } catch (error) {
      console.error("[Gateway] Failed to list tasks:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to list tasks" }));
    }
  }

  async handleCreateTask(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const {
        goal,
        viberId: requestedViberId,
        messages,
        environment,
        settings,
        oauthTokens,
        model,
        metadata,
      } = await readJsonBody<{
        goal?: string;
        viberId?: string;
        messages?: Array<{ role: string; content: string }>;
        environment?: unknown;
        settings?: unknown;
        oauthTokens?: unknown;
        model?: string;
        metadata?: TaskCreateMetadata;
      }>(req);

      if (!goal) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing goal" }));
        return;
      }

      // Find viber (use specified or first available)
      const vibers = this.getVibers();
      let connectedViber: ConnectedViber | undefined;
      if (requestedViberId) {
        connectedViber = vibers.get(requestedViberId);
      } else {
        connectedViber = vibers.values().next().value;
      }

      if (!connectedViber) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No viber available" }));
        return;
      }

      const taskId = randomUUID();
      const displayGoal =
        typeof metadata?.title === "string" && metadata.title.trim().length > 0
          ? metadata.title.trim()
          : goal;
      const now = new Date();

      await this.taskStore.createTask({
        id: taskId,
        userId:
          typeof metadata?.userId === "string" && metadata.userId.trim().length > 0
            ? metadata.userId.trim()
            : null,
        goal: displayGoal,
        viberId: connectedViber.id,
        environmentId:
          typeof metadata?.environmentId === "string" &&
          metadata.environmentId.trim().length > 0
            ? metadata.environmentId.trim()
            : metadata?.environmentId === null
              ? null
              : null,
        status: "pending",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        config: metadata?.config ?? null,
      });

      // Create in-memory runtime state for stream/event buffering.
      const task: GatewayTask = {
        id: taskId,
        viberId: connectedViber.id,
        goal: displayGoal,
        status: "pending",
        createdAt: now,
        events: [],
        partialText: "",
        streamChunks: [],
        streamBytes: 0,
      };
      this.tasks.set(taskId, task);

      // Tell the viber daemon to prepare and run this task.
      connectedViber.ws.send(
        JSON.stringify({
          type: "task:create",
          taskId,
          goal,
          messages,
          environment,
          settings,
          oauthTokens,
          options: model ? { model } : undefined,
        }),
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ taskId }));
    } catch (error) {
      console.error("[Gateway] Failed to create task:", error);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
  }

  async handleGetTask(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    const taskId = params.id;

    try {
      const query = this.readTaskListQuery(req);
      const persisted = await this.taskStore.getTask(taskId);
      const live = this.tasks.get(taskId);

      if (!persisted && !live) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Task not found" }));
        return;
      }

      if (
        query.userId &&
        persisted?.userId &&
        persisted.userId !== query.userId
      ) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Task not found" }));
        return;
      }

      const payload = this.toTaskDetail(live, persisted);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    } catch (error) {
      console.error("[Gateway] Failed to get task:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to get task" }));
    }
  }

  async handleSendMessage(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    const taskId = params.id;

    try {
      const persisted = await this.taskStore.getTask(taskId);
      let task = this.tasks.get(taskId);

      if (!task && persisted?.viberId) {
        task = {
          id: persisted.id,
          viberId: persisted.viberId,
          goal: persisted.goal,
          status: persisted.status,
          createdAt: new Date(persisted.createdAt),
          completedAt: persisted.completedAt
            ? new Date(persisted.completedAt)
            : undefined,
          error: persisted.error ?? undefined,
          events: [],
          partialText: "",
          streamChunks: [],
          streamBytes: 0,
        };
        this.tasks.set(taskId, task);
      }

      if (!task) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Task not found" }));
        return;
      }

      const connectedViber = this.getVibers().get(task.viberId);
      if (!connectedViber) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Viber not connected" }));
        return;
      }

      const { messages, goal, environment, settings, oauthTokens, model } =
        await readJsonBody<{
          messages?: Array<{ role: string; content: string }>;
          goal?: string;
          environment?: unknown;
          settings?: unknown;
          oauthTokens?: unknown;
          model?: string;
        }>(req);

      // Reset runtime state for the new message turn.
      task.status = "pending";
      task.completedAt = undefined;
      task.result = undefined;
      task.error = undefined;
      task.events = [];
      task.partialText = "";
      task.streamChunks = [];
      task.streamBytes = 0;
      if (goal) task.goal = goal;

      await this.taskStore.updateTask(taskId, {
        goal: goal ?? undefined,
        status: "pending",
        completedAt: null,
        error: null,
        updatedAt: new Date().toISOString(),
      });

      // Close old stream subscribers so the new request gets a fresh stream.
      this.closeStreamSubscribers(taskId);

      // Send message to the viber daemon.
      connectedViber.ws.send(
        JSON.stringify({
          type: "task:create",
          taskId,
          goal: goal || task.goal,
          messages,
          environment,
          settings,
          oauthTokens,
          options: model ? { model } : undefined,
        }),
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ taskId }));
    } catch (error) {
      console.error("[Gateway] Failed to send task message:", error);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
  }

  async handleStopTask(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    const taskId = params.id;
    const task = this.tasks.get(taskId);
    const persisted = await this.taskStore.getTask(taskId);

    if (!task && !persisted) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    const viberId = task?.viberId ?? persisted?.viberId;
    if (viberId) {
      const connectedViber = this.getVibers().get(viberId);
      if (connectedViber) {
        connectedViber.ws.send(JSON.stringify({ type: "task:stop", taskId }));
      }
    }

    if (task) {
      task.status = "stopped";
      task.completedAt = new Date();
    }

    await this.taskStore.updateTask(taskId, {
      status: "stopped",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Close any SSE stream subscribers for this task.
    this.closeStreamSubscribers(taskId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }

  async handleArchiveTask(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    try {
      const body = await readJsonBody<{ userId?: string }>(req).catch(
        () => ({}) as { userId?: string },
      );
      const userId =
        typeof body.userId === "string" && body.userId.trim().length > 0
          ? body.userId.trim()
          : undefined;

      await this.taskStore.archiveTask(params.id, userId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error("[Gateway] Failed to archive task:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to archive task" }));
    }
  }

  async handleRestoreTask(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    try {
      await this.taskStore.restoreTask(params.id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error("[Gateway] Failed to restore task:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to restore task" }));
    }
  }

  async handleDeleteTask(
    _req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    try {
      const taskId = params.id;
      const task = this.tasks.get(taskId);
      if (task) {
        const connectedViber = this.getVibers().get(task.viberId);
        if (connectedViber) {
          connectedViber.ws.send(JSON.stringify({ type: "task:stop", taskId }));
        }
        this.tasks.delete(taskId);
      }

      this.closeStreamSubscribers(taskId);
      await this.taskStore.deleteTask(taskId);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error("[Gateway] Failed to delete task:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to delete task" }));
    }
  }

  handleStreamTask(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): void {
    const taskId = params.id;
    const task = this.tasks.get(taskId);
    if (!task) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    // Set SSE headers with AI SDK stream protocol marker.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "x-vercel-ai-ui-message-stream": "v1",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "x-vercel-ai-ui-message-stream",
    });

    // Replay stream chunks that were emitted before this SSE subscriber connected.
    for (const chunk of task.streamChunks) {
      res.write(chunk);
    }

    // If task is already terminal, replay and close immediately.
    if (
      task.status === "completed" ||
      task.status === "error" ||
      task.status === "stopped"
    ) {
      res.end();
      return;
    }

    // Register as an active subscriber for live chunks.
    if (!this.streamSubscribers.has(taskId)) {
      this.streamSubscribers.set(taskId, []);
    }
    const subs = this.streamSubscribers.get(taskId)!;
    subs.push(res);

    // Handle client disconnect.
    req.on("close", () => {
      const idx = subs.indexOf(res);
      if (idx >= 0) subs.splice(idx, 1);
      if (subs.length === 0) this.streamSubscribers.delete(taskId);
    });
  }

  // ==================== WebSocket Message Handlers ====================

  handleTaskStarted(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "running";
      this.persistLifecycle(taskId, { status: "running", error: null });
      console.log(`[Gateway] Task started: ${taskId}`);
    }
  }

  handleTaskCompleted(taskId: string, result: unknown): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "completed";
      task.result = result;
      task.completedAt = new Date();
      if (typeof (result as any)?.text === "string") {
        task.partialText = (result as any).text;
      }
      this.persistLifecycle(taskId, {
        status: "completed",
        completedAt: task.completedAt.toISOString(),
        error: null,
      });
      console.log(`[Gateway] Task completed: ${taskId}`);

      // Close SSE stream subscribers.
      this.closeStreamSubscribers(taskId);
    }
  }

  handleTaskProgress(taskId: string, event: any): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const envelope = this.normalizeProgressEvent(taskId, event);

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

  handleTaskError(taskId: string, error: string, model?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "error";
      task.error = error;
      task.completedAt = new Date();
      this.persistLifecycle(taskId, {
        status: "error",
        completedAt: task.completedAt.toISOString(),
        error,
      });

      console.log(
        `[Gateway] Task error: ${taskId} - ${error}${model ? ` (model: ${model})` : ""}`,
      );

      // Push an error event so it appears in the /api/events stream (and Logs page).
      const now = new Date().toISOString();
      task.events.push({
        at: now,
        event: {
          kind: "error",
          message: error,
          model: model ?? undefined,
          phase: "execution",
        },
      });

      // Close SSE stream subscribers.
      this.closeStreamSubscribers(taskId);
    }
  }

  handleStreamChunk(taskId: string, chunk: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Buffer chunks on the task so late subscribers can replay the stream.
    task.streamChunks.push(chunk);
    task.streamBytes += Buffer.byteLength(chunk);
    while (task.streamChunks.length > 0 && task.streamBytes > MAX_STREAM_BUFFER_BYTES) {
      const removed = task.streamChunks.shift();
      if (removed) {
        task.streamBytes -= Buffer.byteLength(removed);
      }
    }

    const subs = this.streamSubscribers.get(taskId) || [];
    for (const sub of subs) {
      if (!sub.writableEnded) {
        sub.write(chunk);
      }
    }
  }

  // ==================== Internal Helpers ====================

  private readTaskListQuery(req: IncomingMessage): TaskListQuery {
    const parsed = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );

    const userIdRaw = parsed.searchParams.get("userId");
    const userId =
      typeof userIdRaw === "string" && userIdRaw.trim().length > 0
        ? userIdRaw.trim()
        : undefined;

    return {
      userId,
      includeArchived: parsed.searchParams.get("includeArchived") === "true",
    };
  }

  private toTaskSummary(
    live?: GatewayTask,
    persisted?: PersistedGatewayTask,
  ): TaskSummaryResponse {
    const id = live?.id ?? persisted?.id ?? "";
    const viberId = live?.viberId ?? persisted?.viberId ?? null;
    const connectedViber = viberId ? this.getVibers().get(viberId) : undefined;
    const createdAt =
      live?.createdAt.toISOString() ??
      persisted?.createdAt ??
      new Date().toISOString();
    const updatedAt =
      persisted?.updatedAt ??
      live?.completedAt?.toISOString() ??
      live?.createdAt.toISOString() ??
      createdAt;
    const goal = live?.goal ?? persisted?.goal ?? id;

    return {
      id,
      userId: persisted?.userId ?? null,
      viberId,
      viberName: connectedViber?.name ?? viberId ?? null,
      goal,
      status: live?.status ?? persisted?.status ?? "pending",
      createdAt,
      updatedAt,
      completedAt: live?.completedAt?.toISOString() ?? persisted?.completedAt ?? null,
      archivedAt: persisted?.archivedAt ?? null,
      environmentId: persisted?.environmentId ?? null,
      eventCount: live?.events.length ?? 0,
      partialText: live?.partialText,
      isConnected: !!connectedViber,
      error: live?.error ?? persisted?.error ?? null,
    };
  }

  private toTaskDetail(
    live?: GatewayTask,
    persisted?: PersistedGatewayTask | null,
  ): TaskDetailResponse {
    const summary = this.toTaskSummary(live, persisted ?? undefined);
    return {
      ...summary,
      result: live?.result ?? null,
      events: (live?.events as Array<{ at: string; event: unknown }>) ?? [],
      eventCount: live?.events.length ?? 0,
      partialText: live?.partialText ?? "",
    };
  }

  private persistLifecycle(
    taskId: string,
    patch: {
      status: "running" | "completed" | "error" | "stopped";
      completedAt?: string | null;
      error?: string | null;
    },
  ): void {
    void this.taskStore
      .updateTask(taskId, {
        status: patch.status,
        completedAt: patch.completedAt,
        error: patch.error,
        updatedAt: new Date().toISOString(),
      })
      .catch((error) => {
        console.error(`[Gateway] Failed to persist lifecycle for ${taskId}:`, error);
      });
  }

  private normalizeProgressEvent(
    taskId: string,
    payload: any,
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

  closeStreamSubscribers(taskId: string): void {
    const subs = this.streamSubscribers.get(taskId);
    if (subs) {
      for (const sub of subs) {
        if (!sub.writableEnded) {
          sub.end();
        }
      }
      this.streamSubscribers.delete(taskId);
    }
  }
}
