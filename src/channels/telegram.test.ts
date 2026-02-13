import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TelegramChannel } from "./telegram";
import type { ChannelRuntimeContext } from "./channel";

// Mock Telegraf
const mockTelegraf = {
  launch: vi.fn(),
  stop: vi.fn(),
  on: vi.fn(),
  telegram: {
    sendMessage: vi.fn(),
  },
};

vi.mock("telegraf", () => {
  return {
    Telegraf: vi.fn(() => mockTelegraf),
  };
});

describe("TelegramChannel", () => {
  let context: ChannelRuntimeContext;
  let channel: TelegramChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      routeMessage: vi.fn().mockResolvedValue(undefined),
      handleInterrupt: vi.fn().mockResolvedValue(undefined),
    };
    channel = new TelegramChannel(
      {
        enabled: true,
        botToken: "test-token",
        allowUserIds: ["123"],
      },
      context,
    );
  });

  it("should initialize Telegraf with token", () => {
    expect(channel).toBeDefined();
    // Telegraf constructor called
  });

  it("should block unauthorized users", async () => {
    // Get the handler registered with .on('text', ...)
    const onTextHandler = mockTelegraf.on.mock.calls.find(call => call[0] === 'text')?.[1];
    expect(onTextHandler).toBeDefined();

    const ctx = {
      message: { text: "hello", message_id: 1 },
      from: { id: 456 }, // Not in allowUserIds
      chat: { id: 789 },
    };

    await onTextHandler(ctx);

    expect(context.routeMessage).not.toHaveBeenCalled();
  });

  it("should allow authorized users", async () => {
    const onTextHandler = mockTelegraf.on.mock.calls.find(call => call[0] === 'text')?.[1];
    expect(onTextHandler).toBeDefined();

    const ctx = {
      message: { text: "hello", message_id: 1 },
      from: { id: 123 }, // Authorized
      chat: { id: 789, type: "private" },
    };

    await onTextHandler(ctx);

    expect(context.routeMessage).toHaveBeenCalledWith(expect.objectContaining({
      userId: "123",
      content: "hello",
      conversationId: "789",
    }));
  });

  it("should buffer text deltas and send on done", async () => {
    const conversationId = "789";

    // Simulate streaming
    await channel.stream(conversationId, { type: "text-delta", content: "Hello", agentId: "agent" });
    await channel.stream(conversationId, { type: "text-delta", content: " World", agentId: "agent" });

    expect(mockTelegraf.telegram.sendMessage).not.toHaveBeenCalled();

    await channel.stream(conversationId, { type: "done", agentId: "agent" });

    expect(mockTelegraf.telegram.sendMessage).toHaveBeenCalledWith(conversationId, "Hello World");
  });

  it("should handle start and stop", async () => {
      mockTelegraf.launch.mockImplementation(() => {
          return Promise.resolve();
      });

      await channel.start();
      expect(mockTelegraf.launch).toHaveBeenCalled();

      await channel.stop();
      expect(mockTelegraf.stop).toHaveBeenCalled();
  });
});
