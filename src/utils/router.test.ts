import { describe, it, expect, vi } from "vitest";
import { Router, readBody, readJsonBody } from "./router";
import { IncomingMessage, ServerResponse } from "http";
import { EventEmitter } from "events";

class MockReq extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string>;

  constructor(method: string, url: string) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: "localhost" };
  }
}

class MockRes {
  writeHead = vi.fn();
  end = vi.fn();
  setHeader = vi.fn();
  getHeader = vi.fn();
  writableEnded = false;

  constructor() {
    this.end.mockImplementation(() => {
      this.writableEnded = true;
    });
  }
}

describe("Router", () => {
  it("routes GET requests correctly", async () => {
    const router = new Router();
    const handler = vi.fn();
    router.get("/hello", handler);

    const req = new MockReq("GET", "/hello") as unknown as IncomingMessage;
    const res = new MockRes() as unknown as ServerResponse;

    await router.handle(req, res);

    expect(handler).toHaveBeenCalled();
    expect(res.writeHead).not.toHaveBeenCalledWith(404);
  });

  it("handles path parameters", async () => {
    const router = new Router();
    const handler = vi.fn();
    router.get("/users/:id", handler);

    const req = new MockReq("GET", "/users/123") as unknown as IncomingMessage;
    const res = new MockRes() as unknown as ServerResponse;

    await router.handle(req, res);

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ id: "123" })
    );
  });

  it("returns 404 for unknown routes", async () => {
    const router = new Router();
    const req = new MockReq("GET", "/unknown") as unknown as IncomingMessage;
    const res = new MockRes() as unknown as ServerResponse;

    await router.handle(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything());
  });

  it("handles JSON body parsing", async () => {
    const req = new MockReq("POST", "/data") as unknown as IncomingMessage;
    setTimeout(() => {
      req.emit("data", JSON.stringify({ key: "value" }));
      req.emit("end");
    }, 10);

    const body = await readJsonBody(req);
    expect(body).toEqual({ key: "value" });
  });

  it("handles errors in handlers", async () => {
    const router = new Router();
    router.get("/error", () => {
      throw new Error("Test error");
    });

    const req = new MockReq("GET", "/error") as unknown as IncomingMessage;
    const res = new MockRes() as unknown as ServerResponse;

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await router.handle(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.anything());
    consoleSpy.mockRestore();
  });
});
