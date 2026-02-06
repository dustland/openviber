/**
 * Local WebSocket server for terminal streaming (and other local features).
 * 
 * This runs alongside the viber daemon and allows the Viber Board to connect
 * directly for terminal streaming without needing an external hub.
 */

import { WebSocketServer, WebSocket } from "ws";
import { TerminalManager } from "./terminal";

export interface LocalServerConfig {
  port: number;
}

export class LocalServer {
  private wss: WebSocketServer | null = null;
  private terminalManager = new TerminalManager();
  private clients: Set<WebSocket> = new Set();

  constructor(private config: LocalServerConfig) {}

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.config.port });

      this.wss.on("listening", () => {
        console.log(`[Viber] Local WebSocket server listening on port ${this.config.port}`);
        resolve();
      });

      this.wss.on("connection", (ws) => {
        console.log("[Viber] Local client connected");
        this.clients.add(ws);

        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            this.handleMessage(ws, msg);
          } catch (err) {
            console.error("[Viber] Failed to parse message:", err);
          }
        });

        ws.on("close", () => {
          console.log("[Viber] Local client disconnected");
          this.clients.delete(ws);
        });

        ws.on("error", (err) => {
          console.error("[Viber] WebSocket error:", err);
          this.clients.delete(ws);
        });
      });

      this.wss.on("error", (err) => {
        console.error("[Viber] WebSocket server error:", err);
      });
    });
  }

  async stop(): Promise<void> {
    this.terminalManager.detachAll();
    
    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log("[Viber] Local WebSocket server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case "terminal:list":
        this.handleTerminalList(ws);
        break;

      case "terminal:attach":
        this.handleTerminalAttach(ws, msg.target, msg.appId);
        break;

      case "terminal:detach":
        this.handleTerminalDetach(ws, msg.target, msg.appId);
        break;

      case "terminal:input":
        this.handleTerminalInput(msg.target, msg.keys, msg.appId);
        break;

      case "terminal:resize":
        this.handleTerminalResize(ws, msg.target, msg.cols, msg.rows, msg.appId);
        break;

      case "terminal:create-session":
        this.handleTerminalCreateSession(
          ws,
          msg.sessionName,
          msg.windowName,
          msg.cwd,
          msg.appId
        );
        break;

      default:
        console.log(`[Viber] Unknown message type: ${msg.type}`);
    }
  }

  private handleTerminalList(ws: WebSocket): void {
    const { apps, sessions, panes } = this.terminalManager.list();
    this.send(ws, { type: "terminal:list", apps, sessions, panes });
  }

  private async handleTerminalAttach(
    ws: WebSocket,
    target: string,
    appId?: string
  ): Promise<void> {
    console.log(`[Viber] Attaching to terminal: ${target}`);
    const ok = await this.terminalManager.attach(
      target,
      (data) => {
        this.send(ws, { type: "terminal:output", target, appId, data });
      },
      () => {
        this.send(ws, { type: "terminal:detached", target, appId });
      },
      appId
    );
    this.send(ws, { type: "terminal:attached", target, appId, ok });
  }

  private handleTerminalDetach(ws: WebSocket, target: string, appId?: string): void {
    console.log(`[Viber] Detaching from terminal: ${target}`);
    this.terminalManager.detach(target, appId);
    this.send(ws, { type: "terminal:detached", target, appId });
  }

  private handleTerminalInput(target: string, keys: string, appId?: string): void {
    this.terminalManager.sendInput(target, keys, appId);
  }

  private handleTerminalResize(
    ws: WebSocket,
    target: string,
    cols: number,
    rows: number,
    appId?: string
  ): void {
    const ok = this.terminalManager.resize(target, cols, rows, appId);
    this.send(ws, { type: "terminal:resized", target, appId, ok });
  }

  private handleTerminalCreateSession(
    ws: WebSocket,
    sessionName?: string,
    windowName?: string,
    cwd?: string,
    appId = "tmux"
  ): void {
    const result = this.terminalManager.createSession(
      sessionName || "coding",
      windowName || "main",
      cwd,
      appId
    );

    this.send(ws, {
      type: "terminal:session-created",
      ...result,
    });

    if (result.ok) {
      // Keep client in sync immediately after creation
      this.handleTerminalList(ws);
    }
  }

  private send(ws: WebSocket, msg: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
