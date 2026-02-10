import type { IncomingHttpHeaders } from "http";

/**
 * GatewayRequest is the normalized HTTP request payload passed to channel webhook handlers.
 */
export interface GatewayRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  query: URLSearchParams;
  body: string;
  json?: unknown;
}

/**
 * GatewayResponse is the normalized HTTP response returned by webhook handlers.
 */
export interface GatewayResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  json?: unknown;
}

export interface ChannelWebhookRoute {
  method: "GET" | "POST";
  path: string;
  handler: (req: GatewayRequest) => Promise<GatewayResponse>;
}

export interface WebhookChannel {
  getWebhookRoutes(): ChannelWebhookRoute[];
}

export function isWebhookChannel(channel: unknown): channel is WebhookChannel {
  return typeof (channel as WebhookChannel)?.getWebhookRoutes === "function";
}
