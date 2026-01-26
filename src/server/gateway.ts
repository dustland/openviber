import { createServer, IncomingMessage, ServerResponse } from "http";
import * as api from "./api";

export function startGateway(port: number = 3000) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Basic CORS support
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      if (req.method === "GET") {
        if (path === "/api/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

        // Example GET endpoints mapping to API
        // In a real app, we'd use a router library
        if (path === "/api/spaces") {
          const spaces = await api.listSpaces();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(spaces));
          return;
        }
      }

      // 404 for everything else
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));

    } catch (error) {
      console.error("Gateway error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  });

  server.listen(port, () => {
    console.log(`Gateway listening on http://localhost:${port}`);
  });

  return server;
}
