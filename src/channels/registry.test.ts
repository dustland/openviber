import { describe, expect, it } from "vitest";
import { registerBuiltinChannels } from "./builtin";
import { channelRegistry, ChannelRegistry } from "./registry";

describe("ChannelRegistry", () => {
  it("returns capability metadata from listCapabilities", () => {
    const registry = new ChannelRegistry();

    registry.register({
      id: "demo",
      displayName: "Demo",
      description: "Demo channel",
      capabilities: {
        transport: "webhook",
        supportsInboundAttachments: false,
        auth: "token",
        productionReadiness: "beta",
      },
      create: () => ({
        id: "demo",
        type: "webhook",
        start: async () => {},
        stop: async () => {},
        handleMessage: async () => {},
        stream: async () => {},
      }),
    });

    expect(registry.listCapabilities()).toEqual([
      {
        id: "demo",
        displayName: "Demo",
        description: "Demo channel",
        capabilities: {
          transport: "webhook",
          supportsInboundAttachments: false,
          auth: "token",
          productionReadiness: "beta",
        },
      },
    ]);
  });

  it("registers built-in channel capabilities on the shared registry", () => {
    registerBuiltinChannels();

    const web = channelRegistry.get("web");
    const discord = channelRegistry.get("discord");

    expect(web?.capabilities.transport).toBe("sse");
    expect(web?.capabilities.supportsInboundAttachments).toBe(true);

    expect(discord?.capabilities.transport).toBe("websocket");
    expect(discord?.capabilities.controls).toContain("requireMention");
  });
});
