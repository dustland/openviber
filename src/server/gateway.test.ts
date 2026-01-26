import { describe, it, expect, vi, afterEach } from "vitest";
import { startGateway } from "./gateway";
import http from "http";

describe("Gateway Server", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should start and respond to health check", async () => {
    const port = 3001;
    server = startGateway(port);

    const response = await fetch(`http://localhost:${port}/api/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("should return 404 for unknown routes", async () => {
    const port = 3002;
    server = startGateway(port);

    const response = await fetch(`http://localhost:${port}/unknown`);
    expect(response.status).toBe(404);
  });
});
