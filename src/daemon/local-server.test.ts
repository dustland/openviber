import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalServer } from "./local-server";
import WebSocket from "ws";

describe("LocalServer Authentication", () => {
  const port = 6010;
  const authToken = "test-token";
  let server: LocalServer;

  beforeEach(async () => {
    server = new LocalServer({ port, authToken });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("should accept connection with valid token in header", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const open = await new Promise((resolve) => {
      ws.on("open", () => resolve(true));
      ws.on("error", (err) => {
        console.error("WS error:", err);
        resolve(false);
      });
    });

    expect(open).toBe(true);
    ws.close();
  });

  it("should accept connection with valid token in query param", async () => {
    const ws = new WebSocket(`ws://localhost:${port}?token=${authToken}`);

    const open = await new Promise((resolve) => {
      ws.on("open", () => resolve(true));
      ws.on("error", (err) => {
        console.error("WS error:", err);
        resolve(false);
      });
    });

    expect(open).toBe(true);
    ws.close();
  });

  it("should reject connection with invalid token", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`, {
      headers: {
        Authorization: `Bearer wrong-token`,
      },
    });

    const error = await new Promise((resolve) => {
      ws.on("open", () => resolve(null));
      ws.on("error", (err) => resolve(err));
    });

    expect(error).toBeDefined();
  });

  it("should reject connection with missing token", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    const error = await new Promise((resolve) => {
      ws.on("open", () => resolve(null));
      ws.on("error", (err) => resolve(err));
    });

    expect(error).toBeDefined();
  });

  it("should reject connection from unauthorized origin", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Origin: "http://malicious.com",
      },
    });

    const error = await new Promise((resolve) => {
      ws.on("open", () => resolve(null));
      ws.on("error", (err) => resolve(err));
    });

    expect(error).toBeDefined();
  });

  it("should accept connection from localhost origin", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Origin: "http://localhost:6006",
      },
    });

    const open = await new Promise((resolve) => {
      ws.on("open", () => resolve(true));
      ws.on("error", (err) => {
        console.error("WS error:", err);
        resolve(false);
      });
    });

    expect(open).toBe(true);
    ws.close();
  });
});
