/**
 * MCP Client Factory
 * Handles connection to MCP servers via Stdio or SSE
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { McpServerConfig } from "./config";
import { EventSource } from "eventsource";

// Polyfill EventSource for Node.js environment
// This is required for SSEClientTransport in Node.js
if (typeof globalThis.EventSource === "undefined") {
  (globalThis as any).EventSource = EventSource;
}

/**
 * Create and connect an MCP client based on configuration
 */
export async function createMcpClient(config: McpServerConfig) {
  let transport;

  if (config.url) {
    console.log(`[MCP] Connecting to ${config.name} via SSE (${config.url})...`);
    transport = new SSEClientTransport(new URL(config.url), {
      eventSourceInit: {
        // generic headers if needed
      }
    });
  } else if (config.command) {
    console.log(`[MCP] Connecting to ${config.name} via Stdio (${config.command})...`);

    // Construct environment variables ensuring string values
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    if (config.env) {
      Object.assign(env, config.env);
    }

    transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: env,
    });
  } else {
    throw new Error(`MCP server '${config.name}' must have either 'command' or 'url' configured.`);
  }

  const client = new Client(
    {
      name: "openviber-client",
      version: "1.0.0",
    },
    {
      capabilities: {
        // Client capabilities
        // Empty capabilities object indicates basic client support
        roots: {
            listChanged: true,
        },
        sampling: {},
      },
    }
  );

  try {
    await client.connect(transport);
    console.log(`[MCP] Connected to ${config.name}`);
    return client;
  } catch (error) {
    console.error(`[MCP] Failed to connect to ${config.name}:`, error);
    throw error;
  }
}
