import { createServer, IncomingMessage, ServerResponse } from "http";
import * as api from "./api";
import {
  channelManager,
  DingTalkChannel,
  WeComChannel,
  WebChannel,
  webChannel,
} from "../channels";

// Helper to read request body
async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function startGateway(port: number = 3000) {
  // Register web channel by default
  channelManager.register(webChannel);

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
      // ==================== Channel Routes ====================

      // DingTalk webhook
      if (path === "/channels/dingtalk/webhook" && req.method === "POST") {
        const channel = channelManager.getChannel("dingtalk") as DingTalkChannel;
        if (!channel) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "DingTalk channel not configured" }));
          return;
        }

        const body = await readBody(req);
        const payload = JSON.parse(body);
        const message = channel.parseWebhook(payload);

        // Route to channel manager
        await channelManager.routeMessage(message);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // WeCom webhook
      if (path === "/channels/wecom/webhook") {
        const channel = channelManager.getChannel("wecom") as WeComChannel;
        if (!channel) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "WeCom channel not configured" }));
          return;
        }

        // GET for URL verification
        if (req.method === "GET") {
          const signature = url.searchParams.get("msg_signature") || "";
          const timestamp = url.searchParams.get("timestamp") || "";
          const nonce = url.searchParams.get("nonce") || "";
          const echostr = url.searchParams.get("echostr") || "";

          const decrypted = channel.verifyUrl(signature, timestamp, nonce, echostr);
          if (decrypted) {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(decrypted);
          } else {
            res.writeHead(403);
            res.end("Invalid signature");
          }
          return;
        }

        // POST for messages
        if (req.method === "POST") {
          const body = await readBody(req);
          const encrypted = url.searchParams.get("encrypt") || "";
          const message = channel.parseWebhook(body, encrypted);

          if (message) {
            await channelManager.routeMessage(message);
          }

          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("success");
          return;
        }
      }

      // Web channel - POST message
      if (path === "/channels/web/message" && req.method === "POST") {
        const body = await readBody(req);
        const payload = JSON.parse(body);
        const message = webChannel.parseRequest(payload);

        // Start processing (async)
        channelManager.routeMessage(message).catch(console.error);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ conversationId: message.conversationId }));
        return;
      }

      // Web channel - SSE stream
      if (path.startsWith("/channels/web/stream/") && req.method === "GET") {
        const conversationId = path.split("/").pop() || "";

        // Set SSE headers
        res.writeHead(200, WebChannel.createSSEHeaders());

        // Register listener
        const unsubscribe = webChannel.registerSSEConnection(
          conversationId,
          (event) => {
            res.write(WebChannel.formatSSEEvent(event));
            if (event.type === "done" || event.type === "error") {
              res.end();
            }
          }
        );

        // Cleanup on close
        req.on("close", unsubscribe);
        return;
      }

      // ==================== API Routes ====================

      if (req.method === "GET") {
        if (path === "/api/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

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
    console.log(`  DingTalk webhook: POST /channels/dingtalk/webhook`);
    console.log(`  WeCom webhook:    POST /channels/wecom/webhook`);
    console.log(`  Web message:      POST /channels/web/message`);
    console.log(`  Web SSE:          GET  /channels/web/stream/:conversationId`);
  });

  return server;
}
