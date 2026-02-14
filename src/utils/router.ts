import { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  constructor() {}

  /**
   * Register a route handler for a specific HTTP method and path pattern.
   * Path patterns support parameters like `/users/:id`.
   */
  add(method: string, path: string, handler: RouteHandler): void {
    const keys: string[] = [];
    // Normalize path: remove trailing slash unless it's just "/"
    const normalizedPath = path === "/" ? path : path.replace(/\/+$/, "");

    // Convert path to regex. escape special chars except :param
    // e.g. /api/tasks/:id -> ^/api/tasks/([^/]+)$
    const patternString = normalizedPath
      .replace(/([.+*?^$(){}|[\]\\])/g, "\\$1") // Escape regex chars
      .replace(/:(\w+)/g, (_, key) => {
        keys.push(key);
        return "([^/]+)";
      });

    const pattern = new RegExp(`^${patternString}$`);
    this.routes.push({ method: method.toUpperCase(), pattern, keys, handler });
  }

  get(path: string, handler: RouteHandler): void {
    this.add("GET", path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.add("POST", path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.add("PUT", path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.add("DELETE", path, handler);
  }

  options(path: string, handler: RouteHandler): void {
    this.add("OPTIONS", path, handler);
  }

  /**
   * Handle an incoming HTTP request.
   * Matches the URL and method against registered routes.
   * Handles CORS preflight automatically if no OPTIONS handler is found.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");

    // Default CORS headers (can be overridden by handlers)
    if (!res.getHeader("Access-Control-Allow-Origin")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    if (!res.getHeader("Access-Control-Allow-Methods")) {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
    if (!res.getHeader("Access-Control-Allow-Headers")) {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-vercel-ai-ui-message-stream"
      );
    }
    if (!res.getHeader("Access-Control-Expose-Headers")) {
      res.setHeader("Access-Control-Expose-Headers", "x-vercel-ai-ui-message-stream");
    }

    // Handle CORS preflight automatically if no specific OPTIONS handler is matched
    if (method === "OPTIONS") {
      // Check if we have a specific OPTIONS handler
      const hasOptionsHandler = this.routes.some(
        (r) => r.method === "OPTIONS" && r.pattern.test(pathname)
      );
      if (!hasOptionsHandler) {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = pathname.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.keys.forEach((key, index) => {
          // match[0] is the full match, match[1] is the first capture group
          params[key] = decodeURIComponent(match[index + 1]);
        });

        try {
          await route.handler(req, res, params);
        } catch (error) {
          console.error(`[Router] Error handling ${method} ${pathname}:`, error);
          if (!res.writableEnded) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
          }
        }
        return;
      }
    }

    // 404 Not Found
    if (!res.writableEnded) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }
}

/**
 * Helper to read the request body as a string.
 */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", (err) => reject(err));
  });
}

/**
 * Helper to read and parse JSON body.
 */
export async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  const body = await readBody(req);
  try {
    return JSON.parse(body || "{}");
  } catch (err) {
    throw new Error("Invalid JSON body");
  }
}
