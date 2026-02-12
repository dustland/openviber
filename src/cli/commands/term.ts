import { Command } from "commander";
import WebSocket from "ws";

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error("WebSocket connect timed out"));
    }, 5000);

    ws.once("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function waitForWsMessage(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs: number,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for message"));
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (predicate(msg)) {
          cleanup();
          resolve(msg);
        }
      } catch {
        // ignore
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onClose as any);
    };

    ws.on("message", onMessage);
    ws.once("close", onClose);
    ws.once("error", onClose as any);
  });
}

export const termCommand = new Command("term")
  .description("Interact with terminal panes via the viber local WS server (port 6008)")
  .addHelpText(
    "after",
    `
Examples:
  openviber term list
  openviber term create-session coding --window main
  openviber term attach coding:0.0
  openviber term send coding:0.0 "ls -la" --enter
`,
  );

termCommand
  .command("list")
  .description("List terminal sessions and panes")
  .option("--ws <url>", "Local WS URL", "ws://localhost:6008")
  .action(async (options) => {
    try {
      const ws = await openWebSocket(options.ws);
      ws.send(JSON.stringify({ type: "terminal:list" }));

      const msg = await waitForWsMessage(
        ws,
        (m) => m?.type === "terminal:list",
        5000,
      );
      ws.close();

      const sessions = Array.isArray(msg?.sessions) ? msg.sessions : [];
      const panes = Array.isArray(msg?.panes) ? msg.panes : [];

      if (sessions.length === 0 && panes.length === 0) {
        console.log("No terminal sessions found (is the terminal backend installed?).");
        return;
      }

      if (sessions.length > 0) {
        console.log("Sessions:");
        for (const s of sessions) {
          console.log(
            `  - ${s.name} (windows=${s.windows ?? "?"}, attached=${s.attached ?? "?"})`,
          );
        }
        console.log("");
      }

      if (panes.length > 0) {
        console.log("Panes:");
        for (const p of panes) {
          console.log(
            `  - ${p.target}  (${p.session}:${p.windowName} cmd=${p.command ?? "?"})`,
          );
        }
      }
    } catch (err: any) {
      console.error(
        `[term] Failed to list terminals via ${options.ws}: ${err?.message || String(err)}`,
      );
      process.exit(1);
    }
  });

termCommand
  .command("create-session [sessionName]")
  .description("Create a terminal session (used for web-managed terminals)")
  .option("--ws <url>", "Local WS URL", "ws://localhost:6008")
  .option("--window <name>", "First window name", "main")
  .option("--cwd <dir>", "Start directory for first window")
  .action(async (sessionName, options) => {
    try {
      const ws = await openWebSocket(options.ws);
      ws.send(
        JSON.stringify({
          type: "terminal:create-session",
          sessionName: sessionName || "coding",
          windowName: options.window,
          cwd: options.cwd,
        }),
      );

      const msg = await waitForWsMessage(
        ws,
        (m) => m?.type === "terminal:session-created",
        5000,
      );
      ws.close();

      if (msg?.ok) {
        console.log(
          `Session '${msg.sessionName}' ${msg.created ? "created" : "already exists"}.`,
        );
      } else {
        console.error(
          `Failed to create session: ${msg?.error || "unknown error"}`,
        );
        process.exit(1);
      }
    } catch (err: any) {
      console.error(
        `[term] Failed to create session via ${options.ws}: ${err?.message || String(err)}`,
      );
      process.exit(1);
    }
  });

termCommand
  .command("attach <target>")
  .description("Attach to a terminal pane and stream output to stdout")
  .option("--ws <url>", "Local WS URL", "ws://localhost:6008")
  .action(async (target, options) => {
    let ws: WebSocket;
    try {
      ws = await openWebSocket(options.ws);
    } catch (err: any) {
      console.error(
        `[term] Failed to connect to ${options.ws}: ${err?.message || String(err)}`,
      );
      process.exit(1);
    }

    const onSigint = () => {
      try {
        ws.send(JSON.stringify({ type: "terminal:detach", target }));
      } catch {
        // ignore
      }
      ws.close();
      process.exit(0);
    };
    process.on("SIGINT", onSigint);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "terminal:output" && msg?.target === target) {
          process.stdout.write(String(msg.data ?? ""));
        } else if (msg?.type === "terminal:attached" && msg?.target === target) {
          if (!msg.ok) {
            console.error(msg.error || "Failed to attach");
            ws.close();
            process.exit(1);
          }
        }
      } catch {
        // ignore non-JSON
      }
    });

    ws.send(JSON.stringify({ type: "terminal:attach", target }));
    await new Promise<void>((resolve) => ws.on("close", () => resolve()));
  });

termCommand
  .command("send <target> [keys...]")
  .description("Send keys to a terminal pane (use --enter to press Enter after)")
  .option("--ws <url>", "Local WS URL", "ws://localhost:6008")
  .option("--enter", "Send Enter after the keys", false)
  .action(async (target, keys, options) => {
    try {
      const ws = await openWebSocket(options.ws);
      const text = Array.isArray(keys) ? keys.join(" ") : String(keys ?? "");
      ws.send(JSON.stringify({ type: "terminal:input", target, keys: text }));
      if (options.enter) {
        ws.send(JSON.stringify({ type: "terminal:input", target, keys: "Enter" }));
      }
      ws.close();
    } catch (err: any) {
      console.error(
        `[term] Failed to send keys via ${options.ws}: ${err?.message || String(err)}`,
      );
      process.exit(1);
    }
  });

termCommand
  .command("resize <target>")
  .description("Resize a terminal pane (cols/rows)")
  .requiredOption("--cols <n>", "Columns", (v) => parseInt(v, 10))
  .requiredOption("--rows <n>", "Rows", (v) => parseInt(v, 10))
  .option("--ws <url>", "Local WS URL", "ws://localhost:6008")
  .action(async (target, options) => {
    try {
      const ws = await openWebSocket(options.ws);
      ws.send(
        JSON.stringify({
          type: "terminal:resize",
          target,
          cols: options.cols,
          rows: options.rows,
        }),
      );
      const msg = await waitForWsMessage(
        ws,
        (m) => m?.type === "terminal:resized" && m?.target === target,
        5000,
      );
      ws.close();
      if (!msg?.ok) {
        console.error("Resize failed");
        process.exit(1);
      }
    } catch (err: any) {
      console.error(
        `[term] Failed to resize via ${options.ws}: ${err?.message || String(err)}`,
      );
      process.exit(1);
    }
  });
