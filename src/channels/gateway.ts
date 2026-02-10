import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import type { Channel } from "./channel";
import type { ChannelManager } from "./manager";
import { isWebhookChannel, type ChannelWebhookRoute, type GatewayRequest } from "./webhook";

export interface ChannelGatewayConfig {
  host: string;
  port: number;
  /** Optional base path prefix for webhook routes */
  basePath?: string;
}

/**
 * ChannelGateway wires channel plugins to HTTP webhooks and the channel manager.
 * It provides a universal integration surface for webhook-based channels.
 */
export class ChannelGateway {
  private server: ReturnType<typeof createServer> | null = null;
  private routes = new Map<string, ChannelWebhookRoute>();

  constructor(
    private config: ChannelGatewayConfig,
    private channels: Channel[],
    private manager: ChannelManager,
  ) {}

  /**
   * Start all channels and webhook server (if needed).
   */
  async start(): Promise<void> {
    for (const channel of this.channels) {
      this.manager.register(channel);
      if (isWebhookChannel(channel)) {
        for (const route of channel.getWebhookRoutes()) {
          const fullPath = joinPaths(this.config.basePath, route.path);
          const key = `${route.method} ${fullPath}`;
          if (this.routes.has(key)) {
            throw new Error(`Duplicate webhook route: ${key}`);
          }
          this.routes.set(key, { ...route, path: fullPath });
        }
      }
    }

    await this.manager.startAll();

    if (this.routes.size === 0) {
      return;
    }

    await this.startServer();
  }

  /**
   * Stop webhook server and all channels.
   */
  async stop(): Promise<void> {
    await this.manager.stopAll();
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.on("error", (err) => reject(err));
      this.server.listen(this.config.port, this.config.host, () => resolve());
    });
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const method = (req.method || "GET").toUpperCase();
      const url = new URL(req.url || "/", `http://${this.config.host}:${this.config.port}`);
      const key = `${method} ${url.pathname}`;
      const route = this.routes.get(key);

      if (!route) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      const body = await readRequestBody(req);
      let json: unknown;
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.includes("application/json")) {
        try {
          json = body ? JSON.parse(body) : undefined;
        } catch {
          json = undefined;
        }
      }

      const request: GatewayRequest = {
        method,
        path: url.pathname,
        headers: req.headers,
        query: url.searchParams,
        body,
        json,
      };

      const response = await route.handler(request);
      respond(res, response);
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error?.message || "Gateway error" }));
    }
  }
}

function joinPaths(basePath: string | undefined, routePath: string): string {
  const base = basePath ? `/${basePath}`.replace(/\/+/g, "/") : "";
  const route = `/${routePath}`.replace(/\/+/g, "/");
  if (!base || base === "/") {
    return route;
  }
  return `${base.replace(/\/$/, "")}${route}`;
}

function respond(res: ServerResponse, response: { status: number; headers?: Record<string, string>; body?: string; json?: unknown }): void {
  const headers = response.headers ?? {};
  if (response.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  res.writeHead(response.status, headers);
  if (response.json !== undefined) {
    res.end(JSON.stringify(response.json));
    return;
  }
  res.end(response.body ?? "");
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}
