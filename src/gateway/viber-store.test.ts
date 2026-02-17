import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import {
  InMemoryGatewayViberStore,
  SqliteGatewayViberStore,
  createGatewayViberStoreFromEnv,
} from "./viber-store";

describe("InMemoryGatewayViberStore", () => {
  it("persists connect/heartbeat/disconnect transitions", async () => {
    const store = new InMemoryGatewayViberStore();

    await store.upsertConnected({
      id: "viber-1",
      name: "Local Viber",
      version: "1.0.0",
      platform: "darwin",
      capabilities: ["chat"],
    });

    await store.touchHeartbeat("viber-1", "2026-02-17T00:00:00.000Z");
    await store.markDisconnected("viber-1", "2026-02-17T01:00:00.000Z");

    const rows = await store.listVibers();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("viber-1");
    expect(rows[0]?.lastHeartbeatAt).toBe("2026-02-17T00:00:00.000Z");
    expect(rows[0]?.lastDisconnectedAt).toBe("2026-02-17T01:00:00.000Z");
  });
});

describe("SqliteGatewayViberStore", () => {
  it("stores viber metadata in sqlite", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openviber-viber-store-"));
    const dbPath = join(dir, "gateway.sqlite3");

    const store = new SqliteGatewayViberStore({ dbPath });
    await store.upsertConnected({
      id: "viber-sqlite",
      name: "SQLite Viber",
      version: "1.2.3",
      platform: "linux",
      capabilities: ["chat", "jobs"],
    });
    await store.markDisconnected("viber-sqlite", "2026-02-17T02:00:00.000Z");

    const reopened = new SqliteGatewayViberStore({ dbPath });
    const rows = await reopened.listVibers();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("viber-sqlite");
    expect(rows[0]?.capabilities).toContain("jobs");
  });
});

describe("createGatewayViberStoreFromEnv", () => {
  it("defaults to memory backend", () => {
    const store = createGatewayViberStoreFromEnv({});
    expect(store).toBeInstanceOf(InMemoryGatewayViberStore);
  });
});
