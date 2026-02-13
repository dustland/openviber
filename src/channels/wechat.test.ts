import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WeChatChannel } from "./wechat";
import type { ChannelRuntimeContext } from "./channel";

function createChannel() {
  const context: ChannelRuntimeContext = {
    routeMessage: vi.fn(async () => {}),
    handleInterrupt: vi.fn(async () => {}),
  };

  const channel = new WeChatChannel(
    {
      enabled: true,
      apiKey: "test-key",
      proxyUrl: "http://proxy.local",
      accountId: "default",
    },
    context,
  );

  return { channel, context };
}

describe("WeChatChannel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: "1000", data: { msgId: 1 } }),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses flat payload and builds inbound message", () => {
    const { channel } = createChannel();

    const inbound = channel.parseWebhook({
      messageType: "60001",
      wcId: "wxid_bot",
      fromUser: "wxid_sender",
      content: "hello",
      newMsgId: "123",
    });

    expect(inbound).toBeTruthy();
    expect(inbound?.conversationId).toBe("wechat:direct:wxid_sender");
    expect(inbound?.metadata?.replyTo).toBe("wxid_sender");
  });

  it("parses nested payload format", () => {
    const { channel } = createChannel();

    const inbound = channel.parseWebhook({
      messageType: "80001",
      wcId: "wxid_bot",
      data: {
        fromUser: "wxid_member",
        fromGroup: "12345@chatroom",
        content: "group message",
      },
    });

    expect(inbound).toBeTruthy();
    expect(inbound?.conversationId).toBe("wechat:group:12345@chatroom");
    expect(inbound?.metadata?.isGroup).toBe(true);
    expect(inbound?.metadata?.replyTo).toBe("12345@chatroom");
  });

  it("buffers text deltas and sends final text to proxy", async () => {
    const { channel } = createChannel();

    await channel.handleMessage({
      id: "msg-1",
      source: "wechat",
      userId: "wxid_sender",
      conversationId: "wechat:direct:wxid_sender",
      content: "hi",
      metadata: { replyTo: "wxid_sender" },
    });

    await channel.stream("wechat:direct:wxid_sender", {
      type: "text-delta",
      content: "Hello",
      agentId: "viber",
    });

    await channel.stream("wechat:direct:wxid_sender", {
      type: "text-delta",
      content: " world",
      agentId: "viber",
    });

    await channel.stream("wechat:direct:wxid_sender", {
      type: "done",
      agentId: "viber",
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://proxy.local/v1/sendText",
      expect.objectContaining({
        method: "POST",
      }),
    );

    const fetchCalls = vi.mocked(fetch).mock.calls;
    const [, init] = fetchCalls[0] as [string, RequestInit];
    expect(String(init?.body)).toContain('"wcId":"wxid_sender"');
    expect(String(init?.body)).toContain('"content":"Hello world"');
  });
});
