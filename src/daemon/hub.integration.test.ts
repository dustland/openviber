/**
 * Integration test for hub task progress streaming state.
 */

import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { HubServer } from "./hub";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("hub task progress integration", () => {
  let hub: HubServer | null = null;

  afterEach(async () => {
    if (hub) {
      await hub.stop();
      hub = null;
    }
  });

  it("stores task progress events and partial text for board polling", async () => {
    const port = 6707;
    hub = new HubServer({ port });
    await hub.start();

    const ws = new WebSocket(`ws://localhost:${port}/ws`, {
      headers: {
        "x-viber-id": "test-viber",
      },
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    ws.send(
      JSON.stringify({
        type: "connected",
        viber: {
          id: "test-viber",
          name: "Test Viber",
          version: "1.0.0",
          platform: process.platform,
          capabilities: [],
          runningTasks: [],
        },
      }),
    );

    const submit = await fetch(`http://localhost:${port}/api/vibers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "stream me", viberId: "test-viber" }),
    });
    expect(submit.ok).toBe(true);
    const { taskId } = (await submit.json()) as { taskId: string };

    ws.send(
      JSON.stringify({
        type: "task:progress",
        taskId,
        event: {
          eventId: `${taskId}-1`,
          sequence: 1,
          taskId,
          conversationId: taskId,
          createdAt: new Date().toISOString(),
          model: "demo/model",
          event: { kind: "text-delta", delta: "hello " },
        },
      }),
    );
    ws.send(
      JSON.stringify({
        type: "task:progress",
        taskId,
        event: {
          eventId: `${taskId}-2`,
          sequence: 2,
          taskId,
          conversationId: taskId,
          createdAt: new Date().toISOString(),
          event: { kind: "text-delta", delta: "world" },
        },
      }),
    );

    await wait(80);

    const taskRes = await fetch(`http://localhost:${port}/api/tasks/${taskId}`);
    expect(taskRes.ok).toBe(true);
    const task = (await taskRes.json()) as {
      eventCount: number;
      partialText?: string;
      events?: Array<{
        event?: {
          sequence?: number;
          event?: { kind?: string };
        };
      }>;
    };

    expect(task.eventCount).toBeGreaterThanOrEqual(2);
    expect(task.partialText).toContain("hello world");
    expect(
      task.events?.some((e) => e.event?.event?.kind === "text-delta"),
    ).toBe(true);
    expect(task.events?.[0]?.event?.sequence).toBe(1);

    ws.close();
  });
});
