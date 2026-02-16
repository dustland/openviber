/**
 * Event Manager — system event ring buffer, health, and unified event feed.
 */

import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import type { SystemEvent, ConnectedViber, GatewayTask } from "./types";

const MAX_SYSTEM_EVENTS = 200;

export class EventManager {
  private systemEvents: SystemEvent[] = [];

  constructor(
    private getVibers: () => Map<string, ConnectedViber>,
    private getTasks: () => Map<string, GatewayTask>,
  ) { }

  pushSystemEvent(evt: Omit<SystemEvent, "at" | "category">): void {
    this.systemEvents.push({
      ...evt,
      at: new Date().toISOString(),
      category: "system",
    });
    if (this.systemEvents.length > MAX_SYSTEM_EVENTS) {
      this.systemEvents.shift();
    }
  }

  handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    const vibers = this.getVibers();
    const tasks = this.getTasks();

    const vibersSummary = Array.from(vibers.values()).map((n) => {
      const heartbeatAgeMs = Date.now() - n.lastHeartbeat.getTime();
      const isHealthy = heartbeatAgeMs < 90_000;

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

    const totalRunningTasks = tasks.size;
    const healthyVibers = vibersSummary.filter((n) => n.healthy).length;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        healthyVibers,
        tasks: totalRunningTasks,
        vibersSummary,
      }),
    );
  }

  handleListEvents(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "200", 10),
      1000,
    );
    const since = url.searchParams.get("since");
    const sinceMs = since ? new Date(since).getTime() : 0;

    // Collect task activity events
    const activityEvents: Array<{
      at: string;
      category: "activity";
      taskId: string;
      goal: string;
      taskStatus: string;
      event: any;
    }> = [];

    for (const [id, task] of this.getTasks()) {
      for (const evt of task.events) {
        if (sinceMs && new Date(evt.at).getTime() <= sinceMs) continue;
        activityEvents.push({
          at: evt.at,
          category: "activity",
          taskId: id,
          goal: task.goal,
          taskStatus: task.status,
          event: evt.event,
        });
      }
    }

    // Collect system events
    const systemEvents = sinceMs
      ? this.systemEvents.filter(
        (e) => new Date(e.at).getTime() > sinceMs,
      )
      : [...this.systemEvents];

    // Merge and sort descending
    const allEvents = [
      ...activityEvents.map((e) => ({ ...e }) as Record<string, unknown>),
      ...systemEvents.map((e) => ({ ...e }) as Record<string, unknown>),
    ];
    allEvents.sort(
      (a, b) =>
        new Date(b.at as string).getTime() -
        new Date(a.at as string).getTime(),
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ events: allEvents.slice(0, limit) }));
  }

  handleListAllJobs(_req: IncomingMessage, res: ServerResponse): void {
    const viberJobs = Array.from(this.getVibers().values()).map((n) => ({
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
    res.end(JSON.stringify({ viberJobs }));
  }
}
