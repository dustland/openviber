import { describe, expect, it, vi } from "vitest";
import { SlackChannel } from "./slack";

describe("SlackChannel (Skeleton)", () => {
  it("should instantiate without errors", () => {
    const channel = new SlackChannel(
      { enabled: true, botToken: "xoxb", appToken: "xapp" },
      { routeMessage: vi.fn(), handleInterrupt: vi.fn() } as any
    );
    expect(channel).toBeDefined();
    expect(channel.id).toBe("slack");
  });

  it("should handle start gracefully when dependency is missing", async () => {
    const channel = new SlackChannel(
      { enabled: true, botToken: "xoxb", appToken: "xapp" },
      { routeMessage: vi.fn(), handleInterrupt: vi.fn() } as any
    );

    // Mock console.warn/log to keep output clean
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const spyWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await channel.start();

    // Since @slack/bolt is not installed, it should hit the catch block or the if(!this.app) block
    // The implementation logs: "Slack integration requires @slack/bolt dependency."

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Slack integration requires @slack/bolt"));

    spy.mockRestore();
    spyWarn.mockRestore();
  });

  it("should buffer and send message on done", async () => {
    const channel = new SlackChannel(
      { enabled: true, botToken: "xoxb", appToken: "xapp" },
      { routeMessage: vi.fn(), handleInterrupt: vi.fn() } as any
    );

    // Mock the app property (simulating initialize success)
    (channel as any).app = {
      client: {
        chat: {
          postMessage: vi.fn().mockResolvedValue({})
        }
      }
    };

    // Simulate streaming events
    await channel.stream("C123", { type: "text-delta", content: "Hello", agentId: "agent" });
    await channel.stream("C123", { type: "text-delta", content: " World", agentId: "agent" });

    // Should not have sent yet
    expect((channel as any).app.client.chat.postMessage).not.toHaveBeenCalled();

    // Finish stream
    await channel.stream("C123", { type: "done", agentId: "agent" });

    expect((channel as any).app.client.chat.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Hello World"
    });
  });
});
