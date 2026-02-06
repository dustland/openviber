#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";

/**
 * Viber CLI - Command line interface for the Viber framework
 *
 * Commands:
 *   viber start    - Start the viber daemon (connect to command center)
 *   viber run      - Run a task locally without connection to command center
 *   viber chat     - Chat with a running viber via the local hub (terminal-first)
 *   viber term     - List/attach/send input to tmux panes via local WS (port 6008)
 *   viber gateway  - Start the API gateway server (legacy)
 */

import { program } from "commander";
import * as os from "os";
import * as fs from "fs/promises";
import * as path from "path";

const VERSION = getOpenViberVersion();

function getCliName(): string {
  const invokedPath = process.argv[1];
  const invokedName = invokedPath ? path.parse(invokedPath).name : "";
  if (invokedName === "viber" || invokedName === "openviber") return invokedName;
  return "openviber";
}

program
  .name(getCliName())
  .description("OpenViber - Workspace-first assistant runtime (vibers on your machines)")
  .version(VERSION);

// ==================== viber start ====================

program
  .command("start")
  .description(
    "Start viber with all apps (local mode, or connect to server with --server)",
  )
  .option("-s, --server <url>", "Command center URL (enables connected mode)")
  .option("-t, --token <token>", "Authentication token (or set VIBER_TOKEN)")
  .option("-n, --name <name>", "Viber name", `${os.hostname()}-viber`)
  .option("--desktop", "Enable desktop control (UI-TARS)")
  .option("--disable-app <apps...>", "Disable specific apps (comma-separated)")
  .option("--no-apps", "Disable all apps")
  .option("--reconnect-interval <ms>", "Reconnect interval in ms", "5000")
  .option("--heartbeat-interval <ms>", "Heartbeat interval in ms", "30000")
  .action(async (options) => {
    const { JobScheduler } = await import("../daemon/scheduler");
    const { ViberController } = await import("../daemon/controller");
    const { EventEmitter } = await import("events");

    // Import skills module to trigger pre-registration of skill tools
    await import("../skills");

    // Get or generate viber ID
    const viberId = await getViberId();

    // Token from CLI or env (only required if connecting to server)
    const token = options.token || process.env.VIBER_TOKEN;
    const connectToServer = options.server && token;

    if (options.server && !token) {
      console.error(
        "Error: Authentication token required when using --server.",
      );
      console.error(
        "Use --token <token> or set VIBER_TOKEN environment variable.",
      );
      console.error("\nTo get a token, run: viber login");
      process.exit(1);
    }

    // Initialize Scheduler
    // For demo purposes, we load from "examples/jobs". In production, this would be ~/.openviber/jobs
    const jobsDir = path.resolve(process.cwd(), "examples/jobs");
    const scheduler = new JobScheduler(jobsDir);

    console.log(`[Viber] Initializing Cron Scheduler (jobs: ${jobsDir})...`);
    await scheduler.start();

    // Handle graceful shutdown
    const cleanup = async () => {
      console.log("\n[Viber] Shutting down...");
      await scheduler.stop();
    };

    process.on("SIGINT", async () => {
      await cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await cleanup();
      process.exit(0);
    });

    // Start local WebSocket server for terminal streaming (always, both modes)
    const { LocalServer } = await import("../daemon/local-server");
    const localServer = new LocalServer({ port: 6008 });
    await localServer.start();

    // Update cleanup to also stop local server
    const fullCleanup = async () => {
      console.log("\n[Viber] Shutting down...");
      await localServer.stop();
      await scheduler.stop();
    };

    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.on("SIGINT", async () => {
      await fullCleanup();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await fullCleanup();
      process.exit(0);
    });

    // Determine server URL - use provided server, or default to local hub
    const serverUrl = options.server || "ws://localhost:6007/ws";
    const authToken = token || "local-dev-token"; // Local hub doesn't require auth

    const controller = new ViberController({
      serverUrl,
      token: authToken,
      viberId,
      viberName: options.name,
      enableDesktop: options.desktop,
      reconnectInterval: parseInt(options.reconnectInterval, 10),
      heartbeatInterval: parseInt(options.heartbeatInterval, 10),
    });

    const isLocalHub = !options.server;

    controller.on("connected", () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                     VIBER RUNNING                          ║
╠═══════════════════════════════════════════════════════════╣
║  Mode:         ${isLocalHub ? "Local Hub".padEnd(41) : "Remote Server".padEnd(41)
        }║
║  Viber ID:     ${viberId.slice(0, 40).padEnd(40)}║
║  Server:       ${serverUrl.slice(0, 40).padEnd(40)}║
║  Local WS:     ws://localhost:6008                        ║
║  Status:       ● Connected                                ║
╚═══════════════════════════════════════════════════════════╝

Waiting for tasks...
Press Ctrl+C to stop.
      `);
    });

    controller.on("disconnected", () => {
      if (isLocalHub) {
        console.log(
          "[Viber] Disconnected from hub. Is the hub running? (pnpm dev:hub)",
        );
      } else {
        console.log("[Viber] Connection lost. Reconnecting...");
      }
    });

    controller.on("error", (error) => {
      console.error("[Viber] Error:", error.message);
    });

    await controller.start();
  });

// ==================== viber hub ====================

program
  .command("hub")
  .description("Start the hub server (coordinator for viber daemons)")
  .option("-p, --port <port>", "Port to listen on", "6007")
  .action(async (options) => {
    const { HubServer } = await import("../daemon/hub");

    const hub = new HubServer({
      port: parseInt(options.port, 10),
    });

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n[Hub] Shutting down...");
      await hub.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n[Hub] Shutting down...");
      await hub.stop();
      process.exit(0);
    });

    await hub.start();

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                      HUB RUNNING                          ║
╠═══════════════════════════════════════════════════════════╣
║  REST API:     http://localhost:${options.port.padEnd(27)}║
║  WebSocket:    ws://localhost:${options.port}/ws${" ".repeat(21)}║
║  Status:       ● Ready for viber connections              ║
╚═══════════════════════════════════════════════════════════╝

Waiting for viber daemons to connect...
Press Ctrl+C to stop.
    `);
  });

// ==================== viber run ====================

program
  .command("run <goal>")
  .description("Run a task locally (thin daemon runtime, no Space)")
  .option("-m, --model <model>", "LLM model to use", "deepseek/deepseek-chat")
  .option("-a, --agent <agent>", "Agent config to use", "default")
  .action(async (goal, options) => {
    const { runTask } = await import("../daemon/runtime");

    console.log(`[Viber] Running task: ${goal}`);

    try {
      const { streamResult } = await runTask(goal, {
        taskId: `run-${Date.now()}`,
        model: options.model,
        singleAgentId: options.agent,
      });

      for await (const chunk of streamResult.fullStream) {
        if (chunk.type === "text-delta") {
          const text = (chunk as any).text ?? (chunk as any).textDelta;
          if (text) process.stdout.write(text);
        }
      }

      console.log("\n\n[Viber] Task completed");
    } catch (error: any) {
      console.error("[Viber] Task failed:", error.message);
      process.exit(1);
    }
  });

// ==================== viber chat ====================

program
  .command("chat")
  .description(
    "Chat with a running viber via the local hub (works great inside tmux)",
  )
  .option(
    "--hub <url>",
    "Hub base URL (defaults to VIBER_HUB_URL or http://localhost:6007)",
  )
  .option("-v, --viber <id>", "Target viber ID (defaults to first connected)")
  .option(
    "-s, --session <name>",
    "Session name for local history (saved under ~/.openviber/agents/default/sessions/)",
  )
  .option("--no-save", "Do not write chat history to disk")
  .action(async (options) => {
    const hubUrl: string =
      options.hub || process.env.VIBER_HUB_URL || "http://localhost:6007";
    const agentId = "default";

    const sessionsDir = path.join(
      os.homedir(),
      ".openviber",
      "agents",
      agentId,
      "sessions",
    );
    const rawSessionName =
      options.session || `chat-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const sessionName = sanitizeSessionName(rawSessionName);
    const sessionPath = path.join(sessionsDir, `${sessionName}.jsonl`);

    if (options.save !== false) {
      await fs.mkdir(sessionsDir, { recursive: true });
    }

    const vibers = await hubGetVibers(hubUrl);
    if (!vibers.connected || vibers.vibers.length === 0) {
      console.error(`[Chat] No vibers connected to hub at ${hubUrl}`);
      console.error("[Chat] Start the hub + viber in another terminal:");
      console.error("  pnpm dev  (or: pnpm dev:hub + pnpm dev:viber)");
      process.exit(1);
    }

    let activeViberId: string | undefined = options.viber;
    if (activeViberId) {
      const exists = vibers.vibers.some((v) => v.id === activeViberId);
      if (!exists) {
        console.error(`[Chat] Viber not found: ${activeViberId}`);
        console.error(
          `[Chat] Connected vibers:\n${vibers.vibers.map((v) => `  - ${v.id} (${v.name})`).join("\n")}`,
        );
        process.exit(1);
      }
    } else {
      activeViberId = vibers.vibers[0]?.id;
    }

    const persistedMessages =
      options.save !== false ? await readJsonlMessages(sessionPath) : [];
    const messages: { role: "user" | "assistant" | "system"; content: string }[] =
      [...persistedMessages];

    console.log(
      `[Chat] Hub: ${hubUrl}\n[Chat] Viber: ${activeViberId}\n[Chat] Session: ${options.save !== false ? sessionPath : "(not saved)"}\n`,
    );
    console.log("Type your message and press Enter.");
    console.log("Commands: /help, /exit, /vibers, /use <viberId>, /reset\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const cleanup = () => {
      try {
        rl.close();
      } catch {
        // ignore
      }
    };

    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });

    while (true) {
      const line = await question(rl, "you> ");
      const input = line.trim();
      if (!input) continue;

      if (input.startsWith("/")) {
        const handled = await handleChatCommand(input, {
          hubUrl,
          vibers,
          getActiveViberId: () => activeViberId!,
          setActiveViberId: (id) => {
            activeViberId = id;
          },
          resetHistory: async () => {
            messages.length = 0;
            if (options.save !== false) {
              await fs.writeFile(sessionPath, "", "utf8");
            }
          },
        });
        if (handled === "exit") break;
        continue;
      }

      messages.push({ role: "user", content: input });
      if (options.save !== false) {
        await appendJsonlMessage(sessionPath, { role: "user", content: input });
      }

      const submit = await hubSubmitTask(hubUrl, {
        goal: input,
        viberId: activeViberId!,
        messages,
      });
      if (!submit) {
        console.error("[Chat] Failed to submit task");
        continue;
      }

      process.stdout.write("viber> ");
      const result = await pollHubTask(hubUrl, submit.taskId, {
        pollIntervalMs: 1200,
        maxAttempts: 120,
      });

      if (!result) {
        console.log("Task timed out. No response received.");
        continue;
      }

      if (result.status === "error") {
        const errText = `Error: ${result.error || "Task failed"}`;
        console.log(errText);
        messages.push({ role: "assistant", content: errText });
        if (options.save !== false) {
          await appendJsonlMessage(sessionPath, {
            role: "assistant",
            content: errText,
          });
        }
        continue;
      }

      const text =
        (typeof (result.result as any)?.text === "string"
          ? ((result.result as any).text as string).trim()
          : "") ||
        (typeof (result.result as any)?.summary === "string"
          ? ((result.result as any).summary as string).trim()
          : "") ||
        "(No response text)";

      console.log(text);
      messages.push({ role: "assistant", content: text });
      if (options.save !== false) {
        await appendJsonlMessage(sessionPath, {
          role: "assistant",
          content: text,
        });
      }
    }

    cleanup();
  });

// ==================== viber term ====================

const termCommand = program
  .command("term")
  .description("Interact with tmux panes via the viber local WS server (port 6008)")
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
  .description("List tmux sessions and panes")
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
        console.log("No tmux sessions found (or tmux not installed).");
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
  .description("Create a detached tmux session (used for web-managed terminals)")
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
          `Session '${msg.sessionName}' ${msg.created ? "created" : "exists"}. Attach with: tmux attach -t ${msg.sessionName}`,
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
  .description("Attach to a tmux pane target and stream output to stdout")
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
  .description("Send keys to a tmux pane (use --enter to press Enter after)")
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
  .description("Resize a tmux pane (cols/rows)")
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

// ==================== viber login ====================

program
  .command("login")
  .description("Authenticate with command center and get a token")
  .option("-s, --server <url>", "Command center URL", "http://localhost:3000")
  .action(async (options) => {
    console.log("[Viber] Opening browser for authentication...");
    console.log(`\nVisit: ${options.server}/vibers/register`);
    console.log("\nAfter authentication, you'll receive a token.");
    console.log(
      "Set it as VIBER_TOKEN environment variable or use --token option.\n",
    );

    // Try to open browser
    try {
      const { exec } = await import("child_process");
      const url = `${options.server}/vibers/register`;

      if (process.platform === "darwin") {
        exec(`open "${url}"`);
      } else if (process.platform === "linux") {
        exec(`xdg-open "${url}"`);
      } else if (process.platform === "win32") {
        exec(`start "${url}"`);
      }
    } catch {
      // Ignore - user can manually open URL
    }
  });

// ==================== viber status ====================

program
  .command("status")
  .description("Check viber status and configuration")
  .action(async () => {
    const viberId = await getViberId();
    const hasToken = !!process.env.VIBER_TOKEN;
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

    console.log(`
Viber Status
────────────────────────────────────
  Viber ID:      ${viberId}
  Token:         ${hasToken ? "✓ Set (VIBER_TOKEN)" : "✗ Not set"}
  OpenRouter:    ${hasOpenRouter ? "✓ Set (OPENROUTER_API_KEY)" : "✗ Not set"}
  Config Dir:    ${path.join(os.homedir(), ".openviber")}
────────────────────────────────────
    `);
  });

// ==================== viber monitor ====================

// Monitor command removed - functionality moved to 'antigravity-healing' app
// Use `viber start` to run background apps.

// ==================== viber onboard ====================

program
  .command("onboard")
  .description("Initialize OpenViber configuration (first-time setup)")
  .action(async () => {
    const configDir = path.join(os.homedir(), ".openviber");
    const agentsDir = path.join(configDir, "agents");
    const jobsDir = path.join(configDir, "jobs");
    const spaceDir = path.join(configDir, "space");

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║               OPENVIBER SETUP                             ║
╚═══════════════════════════════════════════════════════════╝
`);

    // Create directories
    console.log("Creating directories...");
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.mkdir(spaceDir, { recursive: true });
    console.log(`  ✓ ${configDir}`);
    console.log(`  ✓ ${agentsDir}`);
    console.log(`  ✓ ${jobsDir}`);
    console.log(`  ✓ ${spaceDir}`);

    // Create default agent config
    const defaultAgentPath = path.join(agentsDir, "default.yaml");
    try {
      await fs.access(defaultAgentPath);
      console.log(`\n  ⏭ agents/default.yaml already exists, skipping`);
    } catch {
      const defaultAgent = `# Default Viber Agent Configuration
name: default
description: General-purpose assistant

# LLM Provider (openrouter recommended for multi-model access)
provider: openrouter
model: anthropic/claude-sonnet-4-20250514

# System prompt
systemPrompt: |
  You are a helpful AI assistant running on the user's local machine.
  You have access to files, terminal, and browser tools.
  Be concise and helpful.

# Tools available to this agent
tools:
  - file
  - terminal
  - browser

# Working mode: "always-ask" | "agent-decides" | "always-execute"
workingMode: agent-decides
`;
      await fs.writeFile(defaultAgentPath, defaultAgent);
      console.log(`\n  ✓ Created agents/default.yaml`);
    }

    // Create space bootstrap files
    const taskPath = path.join(spaceDir, "task.md");
    try {
      await fs.access(taskPath);
    } catch {
      await fs.writeFile(taskPath, "# Current Task\n\nNo active task.\n");
      console.log(`  ✓ Created space/task.md`);
    }

    const memoryPath = path.join(spaceDir, "MEMORY.md");
    try {
      await fs.access(memoryPath);
    } catch {
      await fs.writeFile(memoryPath, "# Memory\n\nLong-term notes and context.\n");
      console.log(`  ✓ Created space/MEMORY.md`);
    }

    // Generate viber ID
    const viberId = await getViberId();

    console.log(`
────────────────────────────────────────────────────────────
Setup complete!

Your viber ID: ${viberId}
Config directory: ${configDir}

Next steps:
  1. Set your API key:
     export OPENROUTER_API_KEY="sk-or-v1-xxx"

  2. Start your viber:
     openviber start

  3. Or run a quick task:
     openviber run "Hello, what can you do?"

Get an API key at: https://openrouter.ai/keys
────────────────────────────────────────────────────────────
`);
  });

// ==================== viber gateway ====================

program
  .command("gateway")
  .description("Start the enterprise channel gateway (DingTalk, WeCom, etc.)")
  .option("-p, --port <port>", "Gateway port", "6009")
  .action(async (options) => {
    const { channelManager } = await import("../channels/manager");
    const { DingTalkChannel } = await import("../channels/dingtalk");
    const { WeComChannel } = await import("../channels/wecom");

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   GATEWAY STARTING                        ║
╚═══════════════════════════════════════════════════════════╝
`);

    // Register channels based on environment
    const channels: string[] = [];

    if (process.env.DINGTALK_APP_KEY && process.env.DINGTALK_APP_SECRET) {
      channelManager.register(
        new DingTalkChannel({
          enabled: true,
          appKey: process.env.DINGTALK_APP_KEY,
          appSecret: process.env.DINGTALK_APP_SECRET,
          robotCode: process.env.DINGTALK_ROBOT_CODE,
        })
      );
      channels.push("DingTalk");
    }

    if (
      process.env.WECOM_CORP_ID &&
      process.env.WECOM_AGENT_SECRET &&
      process.env.WECOM_TOKEN &&
      process.env.WECOM_ENCODING_AES_KEY
    ) {
      channelManager.register(
        new WeComChannel({
          enabled: true,
          corpId: process.env.WECOM_CORP_ID,
          agentId: process.env.WECOM_AGENT_ID || "0",
          secret: process.env.WECOM_AGENT_SECRET,
          token: process.env.WECOM_TOKEN,
          aesKey: process.env.WECOM_ENCODING_AES_KEY,
        })
      );
      channels.push("WeCom");
    }


    if (channels.length === 0) {
      console.log(`
No channels configured. Set environment variables to enable channels:

DingTalk:
  DINGTALK_APP_KEY, DINGTALK_APP_SECRET, DINGTALK_ROBOT_CODE

WeCom:
  WECOM_CORP_ID, WECOM_AGENT_ID, WECOM_AGENT_SECRET
  WECOM_TOKEN, WECOM_ENCODING_AES_KEY (optional)

Run 'openviber gateway' again after setting environment variables.
`);
      process.exit(1);
    }

    // Start all channels
    await channelManager.startAll();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n[Gateway] Shutting down...");
      await channelManager.stopAll();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n[Gateway] Shutting down...");
      await channelManager.stopAll();
      process.exit(0);
    });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   GATEWAY RUNNING                         ║
╠═══════════════════════════════════════════════════════════╣
║  Channels:     ${channels.join(", ").padEnd(41)}║
║  Status:       ● Ready                                    ║
╚═══════════════════════════════════════════════════════════╝

Listening for messages from enterprise channels...
Press Ctrl+C to stop.
`);
  });

// ==================== Helpers ====================

async function getViberId(): Promise<string> {
  const configDir = path.join(os.homedir(), ".openviber");
  const idFile = path.join(configDir, "viber-id");

  try {
    await fs.mkdir(configDir, { recursive: true });
    const id = await fs.readFile(idFile, "utf8");
    return id.trim();
  } catch {
    // Generate new ID
    const id = `viber-${os
      .hostname()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36).slice(-6)}`;
    await fs.writeFile(idFile, id);
    return id;
  }
}

// ==================== Chat helpers ====================

interface HubViberListResponse {
  connected: boolean;
  vibers: Array<{ id: string; name: string }>;
}

interface HubTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  result?: unknown;
  error?: string;
}

const SAFE_SESSION_NAME_RE = /[^a-zA-Z0-9_.-]/g;

function sanitizeSessionName(name: string): string {
  const trimmed = String(name || "").trim();
  const replaced = trimmed.replace(SAFE_SESSION_NAME_RE, "-").replace(/-+/g, "-");
  const safe = replaced.length > 0 ? replaced : "chat";
  return safe.slice(0, 120);
}

function normalizeHubUrl(hubUrl: string): string {
  return String(hubUrl || "").trim().replace(/\/$/, "");
}

async function hubGetVibers(hubUrl: string): Promise<HubViberListResponse> {
  try {
    const res = await fetch(`${normalizeHubUrl(hubUrl)}/api/vibers`);
    if (!res.ok) {
      return { connected: false, vibers: [] };
    }
    const json = (await res.json()) as any;
    return {
      connected: !!json?.connected,
      vibers: Array.isArray(json?.vibers) ? json.vibers : [],
    };
  } catch {
    return { connected: false, vibers: [] };
  }
}

async function hubSubmitTask(
  hubUrl: string,
  args: {
    goal: string;
    viberId: string;
    messages: Array<{ role: string; content: string }>;
  },
): Promise<{ taskId: string } | null> {
  try {
    const res = await fetch(`${normalizeHubUrl(hubUrl)}/api/vibers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: args.goal,
        viberId: args.viberId,
        messages: args.messages,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch {
    return null;
  }
}

async function hubGetTask(hubUrl: string, taskId: string): Promise<HubTask | null> {
  try {
    const res = await fetch(`${normalizeHubUrl(hubUrl)}/api/tasks/${taskId}`);
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch {
    return null;
  }
}

async function pollHubTask(
  hubUrl: string,
  taskId: string,
  options: { pollIntervalMs: number; maxAttempts: number },
): Promise<HubTask | null> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const task = await hubGetTask(hubUrl, taskId);
    if (task && (task.status === "completed" || task.status === "error")) {
      return task;
    }
    await sleep(options.pollIntervalMs);
  }
  return await hubGetTask(hubUrl, taskId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function handleChatCommand(
  input: string,
  ctx: {
    hubUrl: string;
    vibers: HubViberListResponse;
    getActiveViberId: () => string;
    setActiveViberId: (id: string) => void;
    resetHistory: () => Promise<void>;
  },
): Promise<"continue" | "exit"> {
  const [cmd, ...rest] = input.slice(1).trim().split(/\s+/);

  switch (cmd) {
    case "exit":
    case "quit":
      return "exit";
    case "help":
      console.log(
        [
          "Commands:",
          "  /help                 Show help",
          "  /exit                 Exit chat",
          "  /vibers               List connected vibers",
          "  /use <viberId>        Switch viber",
          "  /reset                Clear local history (and session file)",
        ].join("\n"),
      );
      return "continue";
    case "vibers": {
      const vibers = await hubGetVibers(ctx.hubUrl);
      if (!vibers.connected || vibers.vibers.length === 0) {
        console.log("No vibers connected.");
        return "continue";
      }
      console.log("Connected vibers:");
      for (const v of vibers.vibers) {
        const active = v.id === ctx.getActiveViberId() ? " (active)" : "";
        console.log(`  - ${v.id} (${v.name})${active}`);
      }
      return "continue";
    }
    case "use": {
      const next = rest[0];
      if (!next) {
        console.log("Usage: /use <viberId>");
        return "continue";
      }
      const vibers = await hubGetVibers(ctx.hubUrl);
      const exists = vibers.vibers.some((v) => v.id === next);
      if (!exists) {
        console.log(`Viber not found: ${next}`);
        return "continue";
      }
      ctx.setActiveViberId(next);
      console.log(`Active viber: ${next}`);
      return "continue";
    }
    case "reset":
      await ctx.resetHistory();
      console.log("History cleared.");
      return "continue";
    default:
      console.log(`Unknown command: /${cmd}. Try /help`);
      return "continue";
  }
}

type JsonlMessage = { role: "user" | "assistant" | "system"; content: string };

async function readJsonlMessages(filePath: string): Promise<JsonlMessage[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
    const out: JsonlMessage[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as any;
        if (
          parsed &&
          (parsed.role === "user" ||
            parsed.role === "assistant" ||
            parsed.role === "system") &&
          typeof parsed.content === "string"
        ) {
          out.push({ role: parsed.role, content: parsed.content });
        }
      } catch {
        // ignore bad lines
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function appendJsonlMessage(filePath: string, msg: JsonlMessage): Promise<void> {
  const line = JSON.stringify({ ...msg, ts: Date.now() });
  await fs.appendFile(filePath, `${line}\n`, "utf8");
}

// ==================== Terminal WS helpers ====================

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

// ==================== Main ====================

program.parse();
