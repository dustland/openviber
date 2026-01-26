/**
 * ViberController Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock WebSocket
vi.mock("ws", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  })),
}));

describe("ViberController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create controller with config", async () => {
      const { ViberController } = await import("../daemon/controller");

      const controller = new ViberController({
        serverUrl: "wss://test.example.com/ws",
        token: "test-token",
        viberId: "test-viber-123",
        viberName: "Test Viber",
      });

      expect(controller).toBeDefined();
    });
  });

  describe("getStatus", () => {
    it("should return connection status", async () => {
      const { ViberController } = await import("../daemon/controller");

      const controller = new ViberController({
        serverUrl: "wss://test.example.com/ws",
        token: "test-token",
        viberId: "test-viber-123",
      });

      const status = controller.getStatus();

      expect(status).toBeDefined();
      expect(status.connected).toBe(false);
      expect(status.runningTasks).toBe(0);
    });
  });

  describe("stop", () => {
    it("should stop controller gracefully", async () => {
      const { ViberController } = await import("../daemon/controller");

      const controller = new ViberController({
        serverUrl: "wss://test.example.com/ws",
        token: "test-token",
        viberId: "test-viber-123",
      });

      // Should not throw
      await expect(controller.stop()).resolves.not.toThrow();
    });
  });
});
