/**
 * HTTP Gateway with Security Features
 * Inspired by ZeroClaw's gateway architecture
 *
 * This is a general-purpose HTTP gateway with:
 * - Rate limiting (sliding window)
 * - Pairing/bearer token authentication
 * - Idempotency handling
 * - Health checks
 * - Webhook secret validation
 *
 * Use this for external integrations, webhooks, and API access.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import crypto from "crypto";

// ============================================================================
// Configuration
// ============================================================================

export interface HttpGatewayConfig {
  /** Host to bind to (default: 127.0.0.1) */
  host: string;
  /** Port to listen on (default: 3000) */
  port: number;
  /** Require pairing before accepting requests (default: true) */
  requirePairing: boolean;
  /** Allow binding to non-localhost without tunnel (default: false) */
  allowPublicBind: boolean;
  /** Max /pair requests per minute per client (default: 10) */
  pairRateLimitPerMinute: number;
  /** Max /webhook requests per minute per client (default: 60) */
  webhookRateLimitPerMinute: number;
  /** TTL for idempotency keys in seconds (default: 300) */
  idempotencyTTLSecs: number;
  /** Optional webhook secret for X-Webhook-Secret header validation */
  webhookSecret?: string;
  /** Pre-paired bearer tokens (loaded from config) */
  pairedTokens?: string[];
}

export const DEFAULT_HTTP_GATEWAY_CONFIG: HttpGatewayConfig = {
  host: "127.0.0.1",
  port: 3000,
  requirePairing: true,
  allowPublicBind: false,
  pairRateLimitPerMinute: 10,
  webhookRateLimitPerMinute: 60,
  idempotencyTTLSecs: 300,
};

// ============================================================================
// Rate Limiting (Sliding Window)
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class SlidingWindowRateLimiter {
  private limit: number;
  private windowMs: number;
  private requests = new Map<string, RateLimitEntry>();

  constructor(limitPerMinute: number) {
    this.limit = limitPerMinute;
    this.windowMs = 60 * 1000; // 1 minute window
  }

  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || now - entry.windowStart > this.windowMs) {
      // New window
      this.requests.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= this.limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  reset(key?: string): void {
    if (key) {
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }
}

// ============================================================================
// Idempotency Store
// ============================================================================

export class IdempotencyStore {
  private ttl: number;
  private keys = new Map<string, number>();

  constructor(ttlSecs: number) {
    this.ttl = ttlSecs * 1000;
  }

  recordIfNew(key: string): boolean {
    const now = Date.now();

    // Clean expired entries
    for (const [k, timestamp] of this.keys.entries()) {
      if (now - timestamp > this.ttl) {
        this.keys.delete(k);
      }
    }

    if (this.keys.has(key)) {
      return false; // Duplicate
    }

    this.keys.set(key, now);
    return true; // New
  }

  clear(): void {
    this.keys.clear();
  }
}

// ============================================================================
// Pairing Guard
// ============================================================================

export class PairingGuard {
  private requirePairing: boolean;
  private pairedTokens = new Set<string>();
  private failedAttempts = new Map<string, { count: number; until: number }>();
  private maxAttempts = 5;
  private lockoutDurationMs = 5 * 60 * 1000; // 5 minutes

  // Generate a one-time pairing code
  private pairingCode: string | null = null;

  constructor(requirePairing: boolean, initialTokens: string[] = []) {
    this.requirePairing = requirePairing;
    for (const token of initialTokens) {
      this.pairedTokens.add(token);
    }

    // Generate initial pairing code if pairing is required and no tokens
    if (requirePairing && this.pairedTokens.size === 0) {
      this.generatePairingCode();
    }
  }

  generatePairingCode(): string {
    // Generate 6-character alphanumeric code
    this.pairingCode = crypto.randomBytes(3).toString("base64").slice(0, 6).toUpperCase();
    return this.pairingCode;
  }

  tryPair(code: string): string | null {
    const clientKey = this.getClientKey();

    // Check if client is locked out
    const lockout = this.failedAttempts.get(clientKey);
    if (lockout && Date.now() < lockout.until) {
      return null; // Locked out
    }

    if (!this.requirePairing) {
      // Pairing disabled - auto-generate token
      const token = this.generateToken();
      this.pairedTokens.add(token);
      this.clearFailedAttempts(clientKey);
      return token;
    }

    if (this.pairingCode && code === this.pairingCode) {
      // Successful pairing
      this.pairingCode = null; // Invalidate code after use
      const token = this.generateToken();
      this.pairedTokens.add(token);
      this.clearFailedAttempts(clientKey);
      return token;
    }

    // Failed attempt
    this.recordFailedAttempt(clientKey);
    return null;
  }

  isAuthenticated(token: string): boolean {
    if (!this.requirePairing) {
      return true;
    }
    return this.pairedTokens.has(token);
  }

  isPaired(): boolean {
    return this.pairedTokens.size > 0;
  }

  getPairingCode(): string | null {
    return this.pairingCode;
  }

  getPairedTokens(): string[] {
    return Array.from(this.pairedTokens);
  }

  addToken(token: string): void {
    this.pairedTokens.add(token);
  }

  private generateToken(): string {
    // Generate secure bearer token (32 bytes = 256 bits)
    return crypto.randomBytes(32).toString("base64url");
  }

  private getClientKey(): string {
    // In a real implementation, this would extract from headers
    return "default";
  }

  private recordFailedAttempt(key: string): void {
    const existing = this.failedAttempts.get(key);
    const count = existing ? existing.count + 1 : 1;

    if (count >= this.maxAttempts) {
      // Lock out for 5 minutes
      this.failedAttempts.set(key, {
        count,
        until: Date.now() + this.lockoutDurationMs,
      });
    } else {
      this.failedAttempts.set(key, { count, until: 0 });
    }
  }

  private clearFailedAttempts(key: string): void {
    this.failedAttempts.delete(key);
  }

  getLockoutRemainingSecs(key: string): number {
    const lockout = this.failedAttempts.get(key);
    if (!lockout) return 0;
    return Math.max(0, Math.ceil((lockout.until - Date.now()) / 1000));
  }
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface HttpGatewayRequest {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  query: URLSearchParams;
  body: string;
  json?: unknown;
}

export interface HttpGatewayResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  json?: unknown;
}

type RouteHandler = (req: HttpGatewayRequest) => Promise<HttpGatewayResponse> | HttpGatewayResponse;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

// ============================================================================
// HTTP Gateway Server
// ============================================================================

export class HttpGatewayServer {
  private server: ReturnType<typeof createServer> | null = null;
  private routes = new Map<string, Route>();
  private rateLimiter: {
    pair: SlidingWindowRateLimiter;
    webhook: SlidingWindowRateLimiter;
  };
  private pairingGuard: PairingGuard;
  private idempotencyStore: IdempotencyStore;

  constructor(
    private config: HttpGatewayConfig,
    handlers?: {
      onWebhook?: (req: HttpGatewayRequest) => Promise<HttpGatewayResponse>;
    }
  ) {
    this.rateLimiter = {
      pair: new SlidingWindowRateLimiter(config.pairRateLimitPerMinute),
      webhook: new SlidingWindowRateLimiter(config.webhookRateLimitPerMinute),
    };
    this.pairingGuard = new PairingGuard(config.requirePairing, config.pairedTokens);
    this.idempotencyStore = new IdempotencyStore(config.idempotencyTTLSecs);

    // Register default routes
    this.registerRoute("GET", "/health", this.handleHealth.bind(this));
    this.registerRoute("POST", "/pair", this.handlePair.bind(this));

    // Register webhook handler with authentication if provided
    if (handlers?.onWebhook) {
      const webhookHandler = this.authenticateWebhook(handlers.onWebhook);
      this.registerRoute("POST", "/webhook", webhookHandler);
    }
  }

  private registerRoute(method: string, path: string, handler: RouteHandler): void {
    const key = `${method} ${path}`;
    this.routes.set(key, { method, path, handler });
  }

  async start(): Promise<void> {
    // Security check: refuse public bind without explicit opt-in
    if (this.config.host !== "127.0.0.1" && this.config.host !== "localhost") {
      if (!this.config.allowPublicBind) {
        throw new Error(
          `Refusing to bind to ${this.config.host} - gateway would be exposed to the internet. ` +
          `Set allowPublicBind: true in config to override.`
        );
      }
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.on("error", reject);
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`🦀 HTTP Gateway listening on http://${this.config.host}:${this.config.port}`);
        this.logStatus();
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private logStatus(): void {
    const pairingCode = this.pairingGuard.getPairingCode();
    if (pairingCode) {
      console.log(`  🔐 PAIRING REQUIRED`);
      console.log(`     ┌──────────────┐`);
      console.log(`     │  ${pairingCode}  │`);
      console.log(`     └──────────────┘`);
      console.log(`     Send: POST /pair with header X-Pairing-Code: ${pairingCode}`);
    } else if (this.config.requirePairing) {
      console.log(`  🔒 Pairing: ACTIVE (bearer token required)`);
    } else {
      console.log(`  ⚠️  Pairing: DISABLED`);
    }

    if (this.config.webhookSecret) {
      console.log(`  🔒 Webhook secret: ENABLED`);
    }

    console.log(`  Endpoints:`);
    console.log(`    GET  /health   - Health check`);
    console.log(`    POST /pair     - Pair a new client`);
    console.log(`    POST /webhook  - Webhook endpoint`);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || "/", `http://${this.config.host}:${this.config.port}`);
      const method = (req.method || "GET").toUpperCase();
      const key = `${method} ${url.pathname}`;

      const route = this.routes.get(key);
      if (!route) {
        this.sendError(res, 404, "Not found");
        return;
      }

      // Read body
      const body = await this.readBody(req);
      let json: unknown | undefined;
      if (req.headers["content-type"]?.includes("application/json")) {
        try {
          json = body ? JSON.parse(body) : undefined;
        } catch {
          // Invalid JSON, continue with undefined
        }
      }

      const gatewayReq: HttpGatewayRequest = {
        method,
        path: url.pathname,
        headers: req.headers,
        query: url.searchParams,
        body,
        json,
      };

      const response = await route.handler(gatewayReq);
      this.sendResponse(res, response);
    } catch (error: any) {
      console.error("[HttpGateway] Request error:", error);
      this.sendError(res, 500, error?.message || "Gateway error");
    }
  }

  private async handleHealth(_req: HttpGatewayRequest): Promise<HttpGatewayResponse> {
    return {
      status: 200,
      json: {
        status: "ok",
        paired: this.pairingGuard.isPaired(),
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async handlePair(req: HttpGatewayRequest): Promise<HttpGatewayResponse> {
    const clientKey = this.getClientKey(req);

    // Rate limit check
    if (!this.rateLimiter.pair.allow(clientKey)) {
      return {
        status: 429,
        json: {
          error: "Too many pairing requests. Please retry later.",
          retry_after: 60,
        },
      };
    }

    const code = req.headers["x-pairing-code"] as string | undefined;
    const pairingCode = Array.isArray(code) ? code[0] : code || "";

    const result = this.pairingGuard.tryPair(pairingCode);

    if (result) {
      console.log("🔐 New client paired successfully");
      return {
        status: 200,
        json: {
          paired: true,
          token: result,
          message: "Save this token — use it as Authorization: Bearer <token>",
        },
      };
    }

    // Check if locked out
    const lockoutSecs = this.pairingGuard.getLockoutRemainingSecs(clientKey);
    if (lockoutSecs > 0) {
      console.warn("🔐 Pairing locked out");
      return {
        status: 429,
        json: {
          error: `Too many failed attempts. Try again in ${lockoutSecs}s.`,
          retry_after: lockoutSecs,
        },
      };
    }

    console.warn("🔐 Pairing attempt with invalid code");
    return {
      status: 403,
      json: { error: "Invalid pairing code" },
    };
  }

  private authenticateWebhook(handler: RouteHandler): RouteHandler {
    return async (req: HttpGatewayRequest) => {
      // Rate limit check
      const clientKey = this.getClientKey(req);
      if (!this.rateLimiter.webhook.allow(clientKey)) {
        return {
          status: 429,
          json: {
            error: "Too many webhook requests. Please retry later.",
            retry_after: 60,
          },
        };
      }

      // Bearer token auth
      if (this.pairingGuard.isAuthenticated) {
        const auth = req.headers["authorization"];
        const token = auth?.toString().startsWith("Bearer ")
          ? auth.slice(7)
          : "";

        if (!this.pairingGuard.isAuthenticated(token)) {
          console.warn("Webhook: rejected — not paired / invalid bearer token");
          return {
            status: 401,
            json: {
              error: "Unauthorized — pair first via POST /pair, then send Authorization: Bearer <token>",
            },
          };
        }
      }

      // Webhook secret auth
      if (this.config.webhookSecret) {
        const headerValue = req.headers["x-webhook-secret"];
        const secret = Array.isArray(headerValue) ? headerValue[0] : headerValue;

        if (!constantTimeEquals(String(secret || ""), this.config.webhookSecret)) {
          console.warn("Webhook: rejected request - invalid or missing X-Webhook-Secret");
          return {
            status: 401,
            json: { error: "Unauthorized - invalid or missing X-Webhook-Secret header" },
          };
        }
      }

      // Idempotency check
      const idempotencyKeyHeader = req.headers["x-idempotency-key"] as string | undefined;
      const idempotencyKey = (Array.isArray(idempotencyKeyHeader)
        ? idempotencyKeyHeader[0]
        : idempotencyKeyHeader || "")?.trim();

      if (idempotencyKey) {
        if (!this.idempotencyStore.recordIfNew(idempotencyKey)) {
          console.log(`Webhook duplicate ignored (idempotency key: ${idempotencyKey})`);
          return {
            status: 200,
            json: {
              status: "duplicate",
              idempotent: true,
              message: "Request already processed for this idempotency key",
            },
          };
        }
      }

      return handler(req);
    };
  }

  private getClientKey(req: HttpGatewayRequest): string {
    // Extract client IP from headers (for reverse proxy setups)
    const forwardedFor = req.headers["x-forwarded-for"];
    const realIp = req.headers["x-real-ip"];

    if (forwardedFor) {
      const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      return ip.split(",")[0].trim();
    }

    if (realIp) {
      return String(realIp);
    }

    return "unknown";
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  private sendResponse(res: ServerResponse, response: HttpGatewayResponse): void {
    const headers = response.headers ?? {};
    if (response.json !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    res.writeHead(response.status, headers);

    if (response.json !== undefined) {
      res.end(JSON.stringify(response.json));
    } else {
      res.end(response.body ?? "");
    }
  }

  private sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }

  // Public API for managing pairing tokens

  addPairedToken(token: string): void {
    this.pairingGuard.addToken(token);
  }

  getPairedTokens(): string[] {
    return this.pairingGuard.getPairedTokens();
  }

  clearRateLimits(): void {
    this.rateLimiter.pair.reset();
    this.rateLimiter.webhook.reset();
  }

  clearIdempotency(): void {
    this.idempotencyStore.clear();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================================
// Factory
// ============================================================================

export function createHttpGatewayServer(
  config: Partial<HttpGatewayConfig> = {},
  handlers?: {
    onWebhook?: (req: HttpGatewayRequest) => Promise<HttpGatewayResponse>;
  }
): HttpGatewayServer {
  const merged = { ...DEFAULT_HTTP_GATEWAY_CONFIG, ...config };
  return new HttpGatewayServer(merged, handlers);
}
