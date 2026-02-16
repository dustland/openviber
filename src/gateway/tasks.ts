/**
 * Task Manager — handles task CRUD, streaming, and progress lifecycle.
 */

import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../utils/router";
import type {
  GatewayTask,
  ConnectedViber,
  TaskProgressEnvelope,
} from "./types";

const MAX_STREAM_BUFFER_BYTES = 2_000_000;

export class TaskManager {
  readonly tasks: Map<string, GatewayTask> = new Map();
  /** Active SSE stream subscribers per task. */
  private streamSubscribers: Map<string, ServerResponse[]> = new Map();

  constructor(
    private getVibers: () => Map<string, ConnectedViber>,
  ) { }

  // ==================== HTTP Handlers ====================

  handleListTasks(_req: IncomingMessage, res: ServerResponse): void {
    const vibers = this.getVibers();
    const tasks = Array.from(this.tasks.values()).map((t) => {
      const connectedViber = vibers.get(t.viberId);
      return {
        id: t.id,
        viberId: t.viberId,
        viberName: connectedViber?.name ?? t.viberId,
        goal: t.goal,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString(),
        eventCount: t.events.length,
        partialText: t.partialText,
        isConnected: !!connectedViber,
      };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tasks }));
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
      } = await readJsonBody(req);

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

      // Create task
      const taskId = `task-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const task: GatewayTask = {
        id: taskId,
        viberId: connectedViber.id,
        goal,
        status: "pending",
        createdAt: new Date(),
        events: [],
        partialText: "",
        streamChunks: [],
        streamBytes: 0,
      };
      this.tasks.set(taskId, task);

      // Tell the viber daemon to prepare and run this task
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
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
  }

  handleGetTask(
    _req: IncomingMessage,
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

    // Include viber info for connectivity
    const connectedViber = this.getVibers().get(task.viberId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: task.id,
        viberId: task.viberId,
        viberName: connectedViber?.name ?? task.viberId,
        goal: task.goal,
        status: task.status,
        result: task.result,
        error: task.error,
        createdAt: task.createdAt.toISOString(),
        completedAt: task.completedAt?.toISOString(),
        events: task.events,
        eventCount: task.events.length,
        partialText: task.partialText,
        isConnected: !!connectedViber,
      }),
    );
  }

  async handleSendMessage(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    const taskId = params.id;
    const task = this.tasks.get(taskId);
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

    try {
      const { messages, goal, environment, settings, oauthTokens, model } =
        await readJsonBody(req);

      // Reset task state for the new message
      task.status = "pending";
      task.completedAt = undefined;
      task.result = undefined;
      task.error = undefined;
      task.events = [];
      task.partialText = "";
      task.streamChunks = [];
      task.streamBytes = 0;
      if (goal) task.goal = goal;

      // Close old stream subscribers so the new request gets a fresh stream
      this.closeStreamSubscribers(taskId);

      // Send message to the viber daemon
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
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
  }

  handleStopTask(
    _req: IncomingMessage,
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

    const connectedViber = this.getVibers().get(task.viberId);
    if (connectedViber) {
      connectedViber.ws.send(
        JSON.stringify({ type: "task:stop", taskId }),
      );
    }

    task.status = "stopped";
    task.completedAt = new Date();

    // Close any SSE stream subscribers for this task
    this.closeStreamSubscribers(taskId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
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
    for (const chunk of task.streamChunks) {
      res.write(chunk);
    }

    // If task is already completed/error/stopped, replay and close immediately.
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

    // Handle client disconnect
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
      console.log(`[Gateway] Task started: ${taskId}`);
    }
  }

  handleTaskCompleted(taskId: string, result: any): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "completed";
      task.result = result;
      task.completedAt = new Date();
      if (typeof result?.text === "string") {
        task.partialText = result.text;
      }
      console.log(`[Gateway] Task completed: ${taskId}`);

      // Close SSE stream subscribers
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
      console.log(
        `[Gateway] Task error: ${taskId} - ${error}${model ? ` (model: ${model})` : ""}`,
      );

      // Push an error event so it appears in the /api/events stream (and Logs page)
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

      // Close SSE stream subscribers
      this.closeStreamSubscribers(taskId);
    }
  }

  handleStreamChunk(taskId: string, chunk: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Buffer chunks on the task so late subscribers can replay the stream.
    task.streamChunks.push(chunk);
    task.streamBytes += Buffer.byteLength(chunk);
    while (
      task.streamChunks.length > 0 &&
      task.streamBytes > MAX_STREAM_BUFFER_BYTES
    ) {
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
