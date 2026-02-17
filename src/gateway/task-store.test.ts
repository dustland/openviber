import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import {
  InMemoryGatewayTaskStore,
  SqliteGatewayTaskStore,
  createGatewayTaskStoreFromEnv,
} from "./task-store";

describe("InMemoryGatewayTaskStore", () => {
  it("creates and lists tasks", async () => {
    const store = new InMemoryGatewayTaskStore();

    await store.createTask({
      id: "task-1",
      userId: "user-1",
      goal: "Test",
      viberId: "viber-1",
      status: "pending",
    });

    const rows = await store.listTasks({ userId: "user-1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("task-1");
    expect(rows[0]?.status).toBe("pending");
  });

  it("archives and restores tasks", async () => {
    const store = new InMemoryGatewayTaskStore();

    await store.createTask({
      id: "task-2",
      userId: "user-1",
      goal: "Archive me",
      status: "pending",
    });

    await store.archiveTask("task-2", "user-1");
    const active = await store.listTasks({ userId: "user-1" });
    expect(active).toHaveLength(0);

    const withArchived = await store.listTasks({
      userId: "user-1",
      includeArchived: true,
    });
    expect(withArchived).toHaveLength(1);
    expect(withArchived[0]?.archivedAt).toBeTruthy();

    await store.restoreTask("task-2");
    const restored = await store.listTasks({ userId: "user-1" });
    expect(restored).toHaveLength(1);
    expect(restored[0]?.archivedAt).toBeNull();
  });
});

describe("SqliteGatewayTaskStore", () => {
  it("persists task metadata to sqlite", async () => {
    const dbDir = mkdtempSync(join(tmpdir(), "openviber-task-store-"));
    const dbPath = join(dbDir, "tasks.sqlite3");

    const store = new SqliteGatewayTaskStore({ dbPath });
    await store.createTask({
      id: "sqlite-task-1",
      userId: "sqlite-user",
      goal: "Persisted",
      status: "pending",
    });

    await store.updateTask("sqlite-task-1", {
      status: "completed",
      completedAt: "2026-02-17T00:00:00.000Z",
    });

    const reopened = new SqliteGatewayTaskStore({ dbPath });
    const row = await reopened.getTask("sqlite-task-1");

    expect(row).toBeTruthy();
    expect(row?.status).toBe("completed");
    expect(row?.userId).toBe("sqlite-user");
  });
});

describe("createGatewayTaskStoreFromEnv", () => {
  it("defaults to memory store", () => {
    const store = createGatewayTaskStoreFromEnv({});
    expect(store).toBeInstanceOf(InMemoryGatewayTaskStore);
  });
});
