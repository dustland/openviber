import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GatewayServer } from "./server";

describe("GatewayServer Integration", () => {
  let server: GatewayServer;
  // Use a random port to avoid conflicts
  const port = 6000 + Math.floor(Math.random() * 1000);

  beforeAll(async () => {
    server = new GatewayServer({ port, taskStoreMode: "memory" });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("responds to /health with status ok", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.vibersSummary).toBeDefined();
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`http://localhost:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});

describe("GatewayServer Security", () => {
  let server: GatewayServer;
  const port = 7000 + Math.floor(Math.random() * 1000);
  const apiToken = "test-gateway-token";

  beforeAll(async () => {
    server = new GatewayServer({
      port,
      taskStoreMode: "memory",
      viberStoreMode: "memory",
      apiToken,
      allowUnauthenticatedLocalhost: false,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("rejects unauthorized API access", async () => {
    const res = await fetch(`http://localhost:${port}/api/tasks`);
    expect(res.status).toBe(401);
  });

  it("allows authorized API access", async () => {
    const res = await fetch(`http://localhost:${port}/api/tasks`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "x-gateway-token": apiToken,
      },
    });
    expect(res.status).toBe(200);
  });
});
