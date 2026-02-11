#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";

/**
 * Viber CLI - Command line interface for the Viber framework
 *
 * Commands:
 *   viber start    - Start the Viber runtime (connect to command center)
 *   viber run      - Run a task locally without connection to command center
 *   viber chat     - Chat with a running task via the local gateway (terminal-first)
 *   viber term     - List/attach/send input to tmux panes via local WS (port 6008)
 *   viber gateway  - Start the gateway (central coordinator for tasks)
 *   viber channels - Start the enterprise channel server (DingTalk, WeCom, etc.)
 */

import { program } from "commander";
import * as os from "os";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import WebSocket from "ws";
import YAML from "yaml";
import { getOpenViberVersion } from "../utils/version";
import type { ChannelRuntimeContext, InboundMessage, InterruptSignal } from "../channels/channel";
import { loadSettings, saveSettings } from "../skills/hub/settings";

const VERSION = getOpenViberVersion();
const OPENVIBER_DIR = path.join(os.homedir(), ".openviber");
const CONFIG_FILE = path.join(OPENVIBER_DIR, "config.yaml");

type SkillHealthCheck = {
  label: string;
  ok: boolean;
  required?: boolean;
  message?: string;
  hint?: string;
};

type SkillHealthResult = {
  id: string;
  name: string;
  status: string;
  available: boolean;
  checks: SkillHealthCheck[];
  summary: string;
};

type SkillHealthReport = {
  generatedAt: string;
  skills: SkillHealthResult[];
};

function getCliName(): string {
  const invokedPath = process.argv[1];
  const invokedName = invokedPath ? path.parse(invokedPath).name : "";
  if (invokedName === "viber" || invokedName === "openviber") return invokedName;
  return "openviber";
}

program
  .name(getCliName())
  .description("OpenViber - Workspace-first assistant runtime (tasks on your Viber)")
  .version(VERSION);

// ==================== viber start ====================

program
  .command("start")
  .description(
    "Start Viber runtime daemon (auto-connects if previously onboarded with --token)",
  )
  .option("-s, --server <url>", "Command center URL (overrides saved config)")
  .option("-t, --token <token>", "Authentication token (overrides saved config)")
  .option("-n, --name <name>", "Viber name", `${os.hostname()}-viber`)
  .option("--desktop", "Enable desktop control (UI-TARS)")
  .option("--disable-app <apps...>", "Disable specific apps (comma-separated)")
  .option("--no-apps", "Disable all apps")
  .option("--standalone", "Run without connecting to gateway/board")
  .option("--skills <skills>", "Comma-separated extra skills for standalone runtime")
  .option("--primary-coding-cli <skillId>", "Preferred coding CLI skill (codex-cli|cursor-agent|gemini-cli)")
  .option("--google-access-token <token>", "Google OAuth access token for standalone skills (e.g. gmail)")
  .option("--google-refresh-token <token>", "Google OAuth refresh token for standalone skills")
  .option("--api-port <port>", "Local API port (embedded gateway)", "6009")
  .option("--reconnect-interval <ms>", "Reconnect interval in ms", "5000")
  .option("--heartbeat-interval <ms>", "Heartbeat interval in ms", "30000")
  .action(async (options) => {
    // Load API keys from ~/.openviber/.env (does not override existing env vars)
    const { loadOpenViberEnv } = await import("./auth");
    await loadOpenViberEnv();

    const { JobScheduler } = await import("../daemon/scheduler");
    const { ViberController } = await import("../daemon/controller");
    const { EventEmitter } = await import("events");

    // Import skills module to trigger pre-registration of skill tools
    await import("../skills");

    // Get or generate viber ID
    const viberId = await getViberId();

    // Load saved config from ~/.openviber/config.yaml if it exists
    const savedConfig = await loadSavedConfig();

    // Determine connection mode: CLI flags > saved config; otherwise standalone.
    const configuredServerUrl =
      options.server ||
      savedConfig?.gatewayUrl ||
      savedConfig?.boardUrl ||
      savedConfig?.hubUrl;
    const serverUrl = options.standalone ? undefined : configuredServerUrl;
    const authToken =
      options.token ||
      process.env.VIBER_TOKEN ||
      savedConfig?.authToken;

    const cliSkills = typeof options.skills === "string"
      ? options.skills
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0)
      : [];
    if (
      cliSkills.length > 0 ||
      options.primaryCodingCli ||
      options.googleAccessToken ||
      options.googleRefreshToken
    ) {
      const settings = await loadSettings();
      if (cliSkills.length > 0) {
        settings.standaloneSkills = Array.from(new Set(cliSkills));
      }
      if (typeof options.primaryCodingCli === "string" && options.primaryCodingCli.trim().length > 0) {
        settings.primaryCodingCli = options.primaryCodingCli.trim();
      }
      if (typeof options.googleAccessToken === "string" && options.googleAccessToken.trim().length > 0) {
        settings.oauthTokens = {
          ...(settings.oauthTokens || {}),
          google: {
            accessToken: options.googleAccessToken.trim(),
            ...(typeof options.googleRefreshToken === "string"
              ? { refreshToken: options.googleRefreshToken.trim() || null }
              : settings.oauthTokens?.google?.refreshToken !== undefined
                ? { refreshToken: settings.oauthTokens.google.refreshToken }
                : {}),
          },
        };
      }
      await saveSettings(settings);
    }

    const isConnectedMode = !!serverUrl;
    const isStandaloneMode = !isConnectedMode;

    if (isConnectedMode) {
      console.log("[Viber] Connected mode — using saved config");
    } else {
      console.log("[Viber] Standalone mode — gateway/board connection is optional");
    }

    // Initialize Scheduler from ~/.openviber/jobs (or OPENVIBER_JOBS_DIR)
    const jobsDir =
      process.env.OPENVIBER_JOBS_DIR || path.join(OPENVIBER_DIR, "jobs");
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

    // Start embedded gateway so the node is a self-contained unit.
    // `viber chat` and other tooling connect to this local API.
    const apiPort = parseInt(options.apiPort || "6009", 10);
    const { GatewayServer } = await import("../daemon/gateway");
    const embeddedGateway = new GatewayServer({ port: apiPort });
    await embeddedGateway.start();
    console.log(`[Viber] Local API ready on http://localhost:${apiPort}`);

    // Start local WebSocket server for terminal streaming (always, both modes)
    const { LocalServer } = await import("../daemon/local-server");
    const localServer = new LocalServer({ port: 6008 });
    await localServer.start();

    // Update cleanup to also stop local server and embedded gateway
    const fullCleanup = async () => {
      console.log("\n[Viber] Shutting down...");
      await localServer.stop();
      await embeddedGateway.stop();
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

    // Controller always connects to the embedded gateway.
    // In connected mode it also connects to the cloud gateway (future).
    const controller = new ViberController({
      serverUrl: `ws://localhost:${apiPort}`,
      token: authToken,
      viberId,
      viberName: options.name || savedConfig?.name || os.hostname(),
      enableDesktop: options.desktop,
      reconnectInterval: parseInt(options.reconnectInterval, 10),
      heartbeatInterval: parseInt(options.heartbeatInterval, 10),
    });

    // When the scheduler loads/reloads jobs, report them to the hub
    // so the web can observe all jobs across all nodes.
    scheduler.on("jobs:loaded", (jobs) => {
      controller.reportJobs(jobs);
    });

    controller.on("connected", () => {
      const w = 55;
      const line = (s: string) => `| ${s.padEnd(w)} |`;
      console.log(`
+${"-".repeat(w + 2)}+
| ${"VIBER RUNNING".padStart(Math.floor((w + 12) / 2)).padEnd(w)} |
+${"-".repeat(w + 2)}+
${line(isStandaloneMode ? "Mode:         Standalone" : "Mode:         Connected")}
${line("Viber ID:     " + viberId.slice(0, 42))}
${line("Local API:    http://localhost:" + apiPort)}
${line("Local WS:     ws://localhost:6008")}
${line("Server:       " + (serverUrl ? serverUrl.slice(0, 42) : "(none)"))}
${line("Status:       " + (isConnectedMode ? "* Connected" : "* Running"))}
+${"-".repeat(w + 2)}+

Waiting for tasks...
Press Ctrl+C to stop.
      `);

      // Report current job list only when connected to hub/gateway
      if (isConnectedMode) {
        controller.reportJobs(scheduler.getLoadedJobs());
      }
    });

    controller.on("disconnected", () => {
      if (isStandaloneMode) {
        console.log("[Viber] Standalone mode active.");
      } else {
        console.log(
          "[Viber] Disconnected from gateway. Is the gateway running? (pnpm dev:gateway)",
        );
      }
    });

    controller.on("error", (error) => {
      console.error("[Viber] Error:", error.message);
    });

    controller.on("job:create", async (msg) => {
      const sanitize = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "job";
      const jobName = sanitize(msg.name);
      const jobPath = path.join(jobsDir, `${jobName}.yaml`);
      const config: Record<string, unknown> = {
        name: msg.name,
        schedule: msg.schedule,
        prompt: msg.prompt,
      };
      if (msg.description) config.description = msg.description;
      if (msg.model) config.model = msg.model;
      if (msg.nodeId) config.nodeId = msg.nodeId;
      try {
        await fs.mkdir(jobsDir, { recursive: true });
        await fs.writeFile(jobPath, YAML.stringify(config), "utf8");
        await scheduler.reload();
        console.log(`[Viber] Job "${msg.name}" added and scheduler reloaded.`);
      } catch (err) {
        console.error("[Viber] Failed to add job:", err);
      }
    });

    await controller.start();
  });

// ==================== viber gateway (central coordinator) ====================

const gatewayAction = async (options: { port: string }) => {
  const { GatewayServer } = await import("../daemon/gateway");

  const gateway = new GatewayServer({
    port: parseInt(options.port, 10),
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[Gateway] Shutting down...");
    await gateway.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n[Gateway] Shutting down...");
    await gateway.stop();
    process.exit(0);
  });

  await gateway.start();

  console.log(`
+-------------------------------------------------------+
|                   GATEWAY RUNNING                       |
+-------------------------------------------------------+
| REST API:     ${("http://localhost:" + options.port).padEnd(43).slice(0, 43)} |
| WebSocket:    ${("ws://localhost:" + options.port + "/ws").padEnd(43).slice(0, 43)} |
| Status:       * Ready for task connections              |
+-------------------------------------------------------+

Waiting for Viber runtimes to connect...
Press Ctrl+C to stop.
  `);
};

program
  .command("gateway")
  .description("Start the gateway (central coordinator for Viber runtimes)")
  .option("-p, --port <port>", "Port to listen on", "6007")
  .action(gatewayAction);

// Deprecated aliases
program
  .command("board", { hidden: true })
  .description("(deprecated: use 'gateway') Start the gateway")
  .option("-p, --port <port>", "Port to listen on", "6007")
  .action(gatewayAction);

program
  .command("hub", { hidden: true })
  .description("(deprecated: use 'gateway') Start the gateway")
  .option("-p, --port <port>", "Port to listen on", "6007")
  .action(gatewayAction);

// ==================== viber run ====================

program
  .command("run <goal>")
  .description("Run a task locally (thin daemon runtime, no Space)")
  .option("-m, --model <model>", "LLM model to use", "deepseek/deepseek-chat")
  .option("-a, --agent <agent>", "Agent config to use", "default")
  .action(async (goal, options) => {
    // Load API keys from ~/.openviber/.env (does not override existing env vars)
    const { loadOpenViberEnv } = await import("./auth");
    await loadOpenViberEnv();

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
    "Chat with a running task via the local gateway (works great inside tmux)",
  )
  .option(
    "--gateway <url>",
    "Gateway URL (defaults to VIBER_GATEWAY_URL or http://localhost:6007)",
  )
  .option(
    "--board <url>",
    "(deprecated: use --gateway) Gateway URL",
  )
  .option(
    "--hub <url>",
    "(deprecated: use --gateway) Gateway URL",
  )
  .option("-v, --viber <id>", "Target task runtime ID (defaults to first connected)")
  .option(
    "-s, --session <name>",
    "Session name for local history (saved under ~/.openviber/vibers/default/sessions/)",
  )
  .option("--no-save", "Do not write chat history to disk")
  .action(async (options) => {
    const gatewayUrl: string =
      options.gateway || options.board || options.hub || process.env.VIBER_GATEWAY_URL || process.env.VIBER_BOARD_URL || process.env.VIBER_HUB_URL || "http://localhost:6009";
    const agentId = "default";

    const sessionsDir = path.join(
      os.homedir(),
      ".openviber",
      "vibers",
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

    const vibers = await hubGetVibers(gatewayUrl);
    if (!vibers.connected || vibers.vibers.length === 0) {
      console.error(`[Chat] No tasks connected to gateway at ${gatewayUrl}`);
      console.error("[Chat] Start the gateway + Viber runtime in another terminal:");
      console.error("  pnpm dev  (or: pnpm dev:gateway + pnpm dev:viber)");
      process.exit(1);
    }

    let activeViberId: string | undefined = options.viber;
    if (activeViberId) {
      const exists = vibers.vibers.some((v) => v.id === activeViberId);
      if (!exists) {
        console.error(`[Chat] Task runtime not found: ${activeViberId}`);
        console.error(
          `[Chat] Connected tasks:\n${vibers.vibers.map((v) => `  - ${v.id} (${v.name})`).join("\n")}`,
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
      `[Chat] Gateway: ${gatewayUrl}\n[Chat] Viber: ${activeViberId}\n[Chat] Session: ${options.save !== false ? sessionPath : "(not saved)"}\n`,
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
          hubUrl: gatewayUrl,
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

      const submit = await hubSubmitTask(gatewayUrl, {
        goal: input,
        viberId: activeViberId!,
        messages,
      });
      if (!submit) {
        console.error("[Chat] Failed to submit task");
        continue;
      }

      process.stdout.write("viber> ");
      const result = await pollHubTask(gatewayUrl, submit.taskId, {
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

// ==================== viber auth ====================

const authCommand = program
  .command("auth")
  .description("Manage API keys and OAuth connections (Google, etc.)")
  .addHelpText(
    "after",
    `
Subcommands:
  google     Connect Google account (Gmail OAuth)
  apikey     Interactive API key setup
  status     Show current auth status (keys + OAuth connections)
  revoke     Disconnect an OAuth provider

Examples:
  viber auth google           # Connect Google (opens browser or shows URL)
  viber auth google --no-browser  # Headless: print URL to paste on another machine
  viber auth apikey           # Interactively set an LLM API key
  viber auth status           # Show all configured credentials
  viber auth revoke google    # Remove local Google OAuth tokens
`,
  );

authCommand
  .command("google")
  .description("Connect a Google account for Gmail and other Google services")
  .option("--no-browser", "Headless mode: print URL instead of opening browser")
  .action(async (options) => {
    const { runGoogleAuth, loadOpenViberEnv } = await import("./auth");
    await loadOpenViberEnv();
    await runGoogleAuth({ noBrowser: options.browser === false });
  });

authCommand
  .command("apikey")
  .description("Interactively configure an LLM provider API key")
  .action(async () => {
    const { runApiKeySetup } = await import("./auth");
    await runApiKeySetup();
  });

authCommand
  .command("status")
  .description("Show current API keys and OAuth connection status")
  .action(async () => {
    const { showAuthStatus, loadOpenViberEnv } = await import("./auth");
    await loadOpenViberEnv();
    await showAuthStatus();
  });

authCommand
  .command("revoke")
  .description("Disconnect a local OAuth provider")
  .argument("<provider>", "OAuth provider to revoke (e.g. google)")
  .action(async (provider: string) => {
    const { revokeOAuthProvider } = await import("./auth");
    await revokeOAuthProvider(provider);
  });

// ==================== viber status ====================

program
  .command("status")
  .description("Check viber status, machine resources, and configuration")
  .option("--gateway <url>", "Gateway URL to query for node status")
  .option("--board <url>", "(deprecated: use --gateway) Gateway URL")
  .option("--hub <url>", "(deprecated: use --gateway) Gateway URL")
  .option("--node <id>", "Node ID to query (defaults to local viber-id)")
  .option("--json", "Output in JSON format")
  .option("--local", "Show local machine resources only (no gateway connection)")
  .action(async (options) => {
    const viberId = await getViberId();
    const hasToken = !!process.env.VIBER_TOKEN;
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

    const {
      collectMachineResourceStatus,
      formatBytes,
      formatUptime,
    } = await import("../daemon/node-status");

    let skillHealthReport: SkillHealthReport | null = null;
    try {
      const { getSkillHealthReport } = await import("../skills/health");
      skillHealthReport = await getSkillHealthReport();
    } catch (err: any) {
      if (!options.json) {
        console.warn(
          `[status] Skill health check failed: ${err?.message || String(err)}`,
        );
      }
    }

    // Always show config status
    if (!options.json) {
      console.log(`
Viber Status
────────────────────────────────────
  Viber ID:      ${viberId}
  Token:         ${hasToken ? "✓ Set (VIBER_TOKEN)" : "✗ Not set"}
  OpenRouter:    ${hasOpenRouter ? "✓ Set (OPENROUTER_API_KEY)" : "✗ Not set"}
  Config Dir:    ${path.join(os.homedir(), ".openviber")}
────────────────────────────────────`);
    }

    // Collect local machine status
    const machineStatus = collectMachineResourceStatus();

    if (options.json) {
      // Try to get gateway status if available
      const statusGatewayUrl =
        options.gateway || options.board || options.hub ||
        process.env.VIBER_GATEWAY_URL || process.env.VIBER_BOARD_URL || process.env.VIBER_HUB_URL ||
        "http://localhost:6007";

      let gatewayNodeStatus = null;
      if (!options.local) {
        try {
          const nodeId = options.node || viberId;
          const res = await fetch(`${statusGatewayUrl}/api/nodes/${nodeId}/status`);
          if (res.ok) {
            gatewayNodeStatus = await res.json();
          }
        } catch {
          // Gateway not reachable, proceed with local only
        }
      }

      console.log(
        JSON.stringify(
          {
            viberId,
            config: {
              token: hasToken,
              openRouter: hasOpenRouter,
              configDir: path.join(os.homedir(), ".openviber"),
            },
            skills: skillHealthReport,
            machine: machineStatus,
            gateway: gatewayNodeStatus,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (skillHealthReport) {
      const lines = formatSkillHealthReport(skillHealthReport);
      if (lines.length > 0) {
        console.log(lines.join("\n"));
      }
    }

    // Display machine resources
    const m = machineStatus;
    console.log(`
Machine Resources
────────────────────────────────────
  Hostname:      ${m.hostname}
  Platform:      ${m.platform}
  Arch:          ${m.arch}
  System Uptime: ${formatUptime(m.systemUptimeSeconds)}

  CPU:           ${m.cpu.cores} cores (${m.cpu.model.trim()})
  CPU Usage:     ${m.cpu.averageUsage.toFixed(1)}% average
  Load Average:  ${m.loadAverage.map((l) => l.toFixed(2)).join(", ")}

  Memory Total:  ${formatBytes(m.memory.totalBytes)}
  Memory Used:   ${formatBytes(m.memory.usedBytes)} (${m.memory.usagePercent.toFixed(1)}%)
  Memory Free:   ${formatBytes(m.memory.freeBytes)}`);

    if (m.disks.length > 0) {
      console.log("");
      console.log("  Disks:");
      for (const d of m.disks) {
        console.log(
          `    ${d.mount.padEnd(12)} ${formatBytes(d.usedBytes)} / ${formatBytes(d.totalBytes)} (${d.usagePercent.toFixed(1)}%)`,
        );
      }
    }

    if (m.network.length > 0) {
      const nonInternal = m.network.filter((n) => !n.internal);
      if (nonInternal.length > 0) {
        console.log("");
        console.log("  Network:");
        for (const iface of nonInternal) {
          console.log(
            `    ${iface.name.padEnd(12)} ${iface.ipv4 || ""}${iface.ipv6 ? "  " + iface.ipv6 : ""}`,
          );
        }
      }
    }

    console.log("────────────────────────────────────");

    // Try to get gateway-based viber running status
    if (!options.local) {
      const statusGatewayUrl2 =
        options.gateway || options.board || options.hub ||
        process.env.VIBER_GATEWAY_URL || process.env.VIBER_BOARD_URL || process.env.VIBER_HUB_URL ||
        "http://localhost:6007";

      try {
        const nodeId = options.node || viberId;
        const res = await fetch(`${statusGatewayUrl2}/api/nodes/${nodeId}/status`);
        if (res.ok) {
          const data = await res.json() as any;
          if (data.status?.viber) {
            const v = data.status.viber;
            console.log(`
Viber Running Status (from hub)
────────────────────────────────────
  Connected:     ● Yes
  Daemon Uptime: ${formatUptime(v.daemonUptimeSeconds)}
  Running Tasks: ${v.runningTaskCount}
  Total Tasks:   ${v.totalTasksExecuted}
  Process RSS:   ${formatBytes(v.processMemory?.rss || 0)}
  Heap Used:     ${formatBytes(v.processMemory?.heapUsed || 0)}
  Skills:        ${(v.skills || []).join(", ") || "none"}
  Capabilities:  ${(v.capabilities || []).join(", ") || "none"}
────────────────────────────────────`);
          }
        }
      } catch {
        console.log(`
  (Hub not reachable at default URL — use --hub to specify)`);
      }
    }

    console.log("");
  });

// ==================== viber monitor ====================

// Monitor command removed - functionality moved to 'antigravity-healing' app
// Use `viber start` to run background apps.

// ==================== viber onboard ====================

program
  .command("onboard")
  .description("Set up OpenViber on this machine (use --token to connect to OpenViber Web)")
  .option("-t, --token <token>", "Onboard token from OpenViber Web (connect mode)")
  .option("--gateway <url>", "Gateway URL override (default: auto from web)")
  .option("--board <url>", "(deprecated: use --gateway) Gateway URL override")
  .option("--hub <url>", "(deprecated: use --gateway) Gateway URL override")
  .option("--no-interactive", "Skip interactive prompts (just scaffold and show health report)")
  .action(async (options) => {
    const configDir = OPENVIBER_DIR;
    const vibersDir = path.join(configDir, "vibers");
    const skillsDir = path.join(configDir, "skills");

    console.log(`
+-------------------------------------------------------+
|               OPENVIBER SETUP                           |
+-------------------------------------------------------+
`);

    // Create directories
    console.log("Creating directories...");
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(vibersDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
    console.log(`  ✓ ${configDir}`);
    console.log(`  ✓ ${vibersDir}`);
    console.log(`  ✓ ${skillsDir}`);

    // ===== Connected mode: onboard with token =====
    if (options.token) {
      console.log("\nConnecting to OpenViber Web...");

      // Determine the web URL to call
      const webBaseUrl = options.gateway || options.board || options.hub || process.env.OPENVIBER_WEB_URL || "http://localhost:6006";

      try {
        const response = await fetch(`${webBaseUrl}/api/nodes/onboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: options.token }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Unknown error" }));
          console.error(`\n  ✗ Onboarding failed: ${err.error || "Invalid or expired token"}`);
          console.error("\n  Create a new viber node on the web and try again.");
          process.exit(1);
        }

        const data = await response.json() as {
          ok: boolean;
          nodeId: string;
          name: string;
          authToken: string;
          config: Record<string, unknown>;
        };

        // Determine the board server WebSocket URL from the web URL
        const gatewayWsUrl = (options.gateway || options.board || options.hub)
          ? (options.gateway || options.board || options.hub).replace(/^http/, "ws") + "/ws"
          : webBaseUrl.replace(/^http/, "ws").replace(":6006", ":6007") + "/ws";

        // Save config for future `openviber start` calls
        const savedConfig = {
          mode: "connected",
          nodeId: data.nodeId,
          name: data.name,
          gatewayUrl: gatewayWsUrl,
          boardUrl: gatewayWsUrl, // deprecated compat
          hubUrl: gatewayWsUrl, // deprecated compat
          authToken: data.authToken,
          webUrl: webBaseUrl,
          onboardedAt: new Date().toISOString(),
        };

        await fs.writeFile(
          CONFIG_FILE,
          `# OpenViber Config — auto-generated by 'openviber onboard --token'
# Do not edit manually. Manage your viber at ${webBaseUrl}
${YAML.stringify(savedConfig)}`,
        );

        console.log(`  ✓ Connected to ${webBaseUrl}`);
        console.log(`  ✓ Node: ${data.name} (${data.nodeId.slice(0, 8)}...)`);
        console.log(`  ✓ Config saved to ${CONFIG_FILE}`);

      } catch (error: any) {
        console.error(`\n  ✗ Failed to connect: ${error.message}`);
        console.error(`\n  Make sure the OpenViber web is running at ${options.gateway || options.board || options.hub || "http://localhost:6006"}.`);
        process.exit(1);
      }
    } else {
      // ===== Standalone mode: local-only setup =====
      console.log("Setting up standalone mode (local-only)...");

      // Save standalone config
      const savedConfig = {
        mode: "standalone",
        onboardedAt: new Date().toISOString(),
      };

      try {
        await fs.access(CONFIG_FILE);
        console.log(`\n  ⏭ config.yaml already exists, skipping`);
      } catch {
        await fs.writeFile(
          CONFIG_FILE,
          `# OpenViber Config — standalone mode\n# To connect to OpenViber Web, re-run: openviber onboard --token <token>\n${YAML.stringify(savedConfig)}`,
        );
        console.log(`  ✓ Created config.yaml (standalone mode)`);
      }
    }

    // Scaffold viber files (both modes)
    const defaultViberPath = path.join(vibersDir, "default.yaml");
    try {
      await fs.access(defaultViberPath);
      console.log(`\n  ⏭ vibers/default.yaml already exists, skipping`);
    } catch {
      const defaultViber = `# Default Viber Configuration
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

# Tools available to this viber
tools:
  - file
  - terminal
  - browser

# Working mode: "always-ask" | "viber-decides" | "always-execute"
workingMode: viber-decides
`;
      await fs.writeFile(defaultViberPath, defaultViber);
      console.log(`\n  ✓ Created vibers/default.yaml`);
    }

    // Create user.md (shared across vibers)
    const userMdPath = path.join(configDir, "user.md");
    try {
      await fs.access(userMdPath);
    } catch {
      await fs.writeFile(userMdPath, "# User Context\n\nDescribe who you are and what you're working on.\n");
      console.log(`  ✓ Created user.md`);
    }

    // Create per-viber soul.md and memory.md
    const defaultViberDir = path.join(vibersDir, "default");
    await fs.mkdir(defaultViberDir, { recursive: true });

    const soulPath = path.join(defaultViberDir, "soul.md");
    try {
      await fs.access(soulPath);
    } catch {
      await fs.writeFile(soulPath, "# Soul\n\nDefine this viber's personality and communication style.\n");
      console.log(`  ✓ Created vibers/default/soul.md`);
    }

    const memoryPath = path.join(defaultViberDir, "memory.md");
    try {
      await fs.access(memoryPath);
    } catch {
      await fs.writeFile(memoryPath, "# Memory\n\nLong-term notes and context.\n");
      console.log(`  ✓ Created vibers/default/memory.md`);
    }

    // Generate viber ID
    const viberId = await getViberId();

    // Load any previously saved API keys from ~/.openviber/.env
    const { loadOpenViberEnv, runOnboardingWizard } = await import("./auth");
    await loadOpenViberEnv();

    // Interactive onboarding wizard (LLM key, skill picker, skill setup)
    // or passive health report with --no-interactive
    let selectedSkills: string[] = [];

    if (options.interactive === false) {
      // Non-interactive: just show the health report (legacy behavior)
      try {
        const { getSkillHealthReport } = await import("../skills/health");
        const report = await getSkillHealthReport();
        const lines = formatSkillHealthReport(report);
        if (lines.length > 0) {
          console.log(lines.join("\n"));
        }
      } catch (err: any) {
        console.warn(
          `[onboard] Skill health check failed: ${err?.message || String(err)}`,
        );
      }
    } else {
      // Interactive: full wizard
      try {
        selectedSkills = await runOnboardingWizard();

        // Save selected skills to settings.yaml
        if (selectedSkills.length > 0) {
          const settings = await loadSettings();
          settings.standaloneSkills = Array.from(
            new Set([...(settings.standaloneSkills || []), ...selectedSkills]),
          );
          await saveSettings(settings);
        }
      } catch (err: any) {
        console.warn(
          `[onboard] Interactive setup failed: ${err?.message || String(err)}`,
        );
        // Fall back to passive health report
        try {
          const { getSkillHealthReport } = await import("../skills/health");
          const report = await getSkillHealthReport();
          const lines = formatSkillHealthReport(report);
          if (lines.length > 0) {
            console.log(lines.join("\n"));
          }
        } catch {
          // ignore
        }
      }
    }

    const mode = options.token ? "connected" : "standalone";
    const nextCmd = options.token
      ? "openviber start"
      : "openviber start  (or: openviber run \"Hello!\")";
    const connectHint = options.token
      ? ""
      : "\n  To connect to OpenViber Web later:\n     openviber onboard --token <token-from-web>\n";

    console.log(`
────────────────────────────────────────────────────────────
Setup complete! (${mode} mode)

Your viber ID: ${viberId}
Config directory: ${configDir}

Next step:
  ${nextCmd}
${connectHint}
────────────────────────────────────────────────────────────
`);
  });

// ==================== viber skill ====================

const skillCommand = program
  .command("skill")
  .description("Explore, import, and manage skills from external sources")
  .addHelpText(
    "after",
    `
Sources:
  openclaw      OpenClaw Skill Hub (community registry)
  github        GitHub repositories (tagged with openviber-skill topic)
  npm           npm packages (with openviber-skill keyword)
  huggingface   Hugging Face models/spaces
  smithery      Smithery MCP server registry
  composio      Composio tool integrations (250+ SaaS)
  glama         Glama MCP server directory

Examples:
  openviber skill search "web scraping"
  openviber skill search --source github "browser automation"
  openviber skill search --source smithery "filesystem"
  openviber skill info github dustland/openviber-skill-web
  openviber skill import dustland/openviber-skill-web
  openviber skill import npm:@openviber-skills/web-search
  openviber skill import smithery:@anthropic/mcp-server-filesystem
  openviber skill list
  openviber skill remove my-skill
  openviber skill verify cursor-agent
`,
  );

skillCommand
  .command("search [query]")
  .description("Search for skills across external hubs")
  .option("-s, --source <source>", "Source to search (openclaw, github, npm, huggingface, smithery, composio, glama)")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .option("--author <author>", "Filter by author")
  .option("--sort <sort>", "Sort order: relevance, popularity, recent, name", "relevance")
  .option("-n, --limit <limit>", "Results per page", "20")
  .option("-p, --page <page>", "Page number", "1")
  .action(async (query, options) => {
    const { getSkillHubManagerWithSettings } = await import("../skills/hub/manager");
    const manager = await getSkillHubManagerWithSettings();

    const source = options.source as any;
    const searchQuery = {
      query: query || undefined,
      tags: options.tags ? options.tags.split(",").map((t: string) => t.trim()) : undefined,
      author: options.author,
      sort: options.sort as any,
      limit: parseInt(options.limit, 10),
      page: parseInt(options.page, 10),
    };

    console.log(`\nSearching for skills${query ? ` matching "${query}"` : ""}${source ? ` on ${source}` : " across all sources"}...\n`);

    const result = await manager.search(searchQuery, source);

    if (result.skills.length === 0) {
      console.log("No skills found. Try a different query or source.");
      console.log("\nTip: Use --source github to search GitHub repositories");
      console.log("     Use --source npm to search npm packages");
      return;
    }

    // Display results in a table-like format
    console.log(`Found ${result.total} skill(s) (page ${result.page}/${result.totalPages}):\n`);

    const maxNameLen = Math.max(20, ...result.skills.map((s) => s.name.length));
    const nameCol = Math.min(maxNameLen, 35);

    for (const skill of result.skills) {
      const name = skill.name.padEnd(nameCol).slice(0, nameCol);
      const desc = (skill.description || "(no description)").slice(0, 50);
      const source = skill.source.padEnd(8);
      const stars = skill.popularity ? `★${skill.popularity}` : "";
      const version = skill.version !== "latest" ? `v${skill.version}` : "";
      const meta = [source, stars, version].filter(Boolean).join(" ");

      console.log(`  ${name}  ${desc}`);
      console.log(`  ${"".padEnd(nameCol)}  ${meta}  ${skill.author}`);
      console.log("");
    }

    if (result.totalPages > result.page) {
      console.log(`\nPage ${result.page}/${result.totalPages}. Use --page ${result.page + 1} to see more.`);
    }

    console.log(`\nTo import: openviber skill import <skill-id>`);
    console.log(`For details: openviber skill info <source> <skill-id>`);
  });

skillCommand
  .command("info <source> <skillId>")
  .description("Get detailed info about a skill (source: openclaw, github, npm)")
  .action(async (source, skillId) => {
    const { getSkillHubManager } = await import("../skills/hub");
    const manager = getSkillHubManager();

    console.log(`\nFetching info for '${skillId}' from ${source}...\n`);

    const info = await manager.getSkillInfo(skillId, source as any);

    if (!info) {
      console.error(`Skill not found: ${skillId} on ${source}`);
      process.exit(1);
    }

    console.log(`╭─────────────────────────────────────────────────────╮`);
    console.log(`│ ${info.name.padEnd(52)}│`);
    console.log(`├─────────────────────────────────────────────────────┤`);
    console.log(`│ Source:       ${info.source.padEnd(38)}│`);
    console.log(`│ Author:       ${info.author.padEnd(38)}│`);
    console.log(`│ Version:      ${info.version.padEnd(38)}│`);
    if (info.license) {
      console.log(`│ License:      ${info.license.padEnd(38)}│`);
    }
    if (info.popularity) {
      console.log(`│ Popularity:   ${String(info.popularity).padEnd(38)}│`);
    }
    if (info.tags?.length) {
      console.log(`│ Tags:         ${info.tags.slice(0, 5).join(", ").padEnd(38)}│`);
    }
    if (info.url) {
      console.log(`│ URL:          ${info.url.slice(0, 38).padEnd(38)}│`);
    }
    if (info.updatedAt) {
      console.log(`│ Updated:      ${info.updatedAt.slice(0, 10).padEnd(38)}│`);
    }
    console.log(`╰─────────────────────────────────────────────────────╯`);

    if (info.description) {
      console.log(`\n${info.description}`);
    }

    if (info.readme) {
      console.log(`\n--- README ---\n`);
      // Show first 40 lines of readme
      const lines = info.readme.split("\n");
      console.log(lines.slice(0, 40).join("\n"));
      if (lines.length > 40) {
        console.log(`\n... (${lines.length - 40} more lines)`);
      }
    }

    if (info.dependencies?.length) {
      console.log(`\nDependencies: ${info.dependencies.join(", ")}`);
    }

    console.log(`\nTo import: openviber skill import ${info.source === "npm" ? "npm:" : info.source === "github" ? "" : "openclaw:"}${info.id}`);
  });

skillCommand
  .command("import <skillId>")
  .description("Import a skill from an external source")
  .option("-s, --source <source>", "Source override (openclaw, github, npm)")
  .option("-d, --dir <dir>", "Custom install directory (default: ~/.openviber/skills)")
  .action(async (skillId, options) => {
    const { getSkillHubManager } = await import("../skills/hub");
    const manager = getSkillHubManager();

    console.log(`\nImporting skill '${skillId}'...\n`);

    const result = await manager.importSkill(skillId, {
      source: options.source as any,
      targetDir: options.dir,
    });

    if (result.ok) {
      console.log(`\n✓ ${result.message}`);
      console.log(`\nThe skill is now available in your local skills directory.`);
      console.log(`Restart your viber to load the new skill.\n`);
    } else {
      console.error(`\n✗ ${result.message}`);
      if (result.error) {
        console.error(`  Error: ${result.error}`);
      }
      process.exit(1);
    }
  });

skillCommand
  .command("list")
  .description("List locally installed skills")
  .action(async () => {
    const { getSkillHubManager } = await import("../skills/hub");
    const manager = getSkillHubManager();

    const installed = await manager.listInstalled();

    if (installed.length === 0) {
      console.log("\nNo external skills installed.\n");
      console.log("Search for skills:    openviber skill search <query>");
      console.log("Import from GitHub:   openviber skill import owner/repo");
      console.log("Import from npm:      openviber skill import npm:<package>\n");
      return;
    }

    console.log(`\nInstalled skills (${installed.length}):\n`);

    const maxNameLen = Math.max(15, ...installed.map((s) => s.name.length));
    const nameCol = Math.min(maxNameLen, 30);

    for (const skill of installed) {
      const name = skill.name.padEnd(nameCol).slice(0, nameCol);
      const source = (skill.source || "local").padEnd(10);
      const version = skill.version || "";
      console.log(`  ${name}  ${source}  ${version}`);
      console.log(`  ${"".padEnd(nameCol)}  ${skill.dir}`);
      console.log("");
    }
  });

skillCommand
  .command("remove <name>")
  .description("Remove a locally installed skill")
  .action(async (name) => {
    const { getSkillHubManager } = await import("../skills/hub");
    const manager = getSkillHubManager();

    const result = await manager.removeSkill(name);

    if (result.ok) {
      console.log(`\n✓ ${result.message}\n`);
    } else {
      console.error(`\n✗ ${result.message}\n`);
      process.exit(1);
    }
  });

skillCommand
  .command("verify <skillId>")
  .description("Run a skill playground scenario to verify a skill works")
  .option("-w, --wait <seconds>", "Max seconds to wait for verification", "120")
  .option("--no-refresh", "Skip updating the playground repo before running")
  .action(async (skillId, options) => {
    // Ensure skill tools are pre-registered
    await import("../skills");
    const { getTools } = await import("../skills/playground");
    const tool = getTools().skill_playground_verify;

    const waitSeconds = parseInt(options.wait, 10);
    const payload = {
      skillId,
      waitSeconds: Number.isNaN(waitSeconds) ? undefined : waitSeconds,
      refreshRepo: options.refresh,
    };

    console.log(`\nRunning playground for '${skillId}'...\n`);
    const result = await tool.execute(payload);

    if (result.ok) {
      console.log(`✓ Playground completed for '${skillId}'`);
    } else {
      console.error(`✗ Playground failed for '${skillId}'`);
      if (result.error) {
        console.error(`  Error: ${result.error}`);
      }
    }

    if (result.playground) {
      console.log(`\nRepo: ${result.playground.repo}`);
      console.log(`File: ${result.playground.file}`);
      if (result.playground.repoPath) {
        console.log(`Path: ${result.playground.repoPath}`);
      }
      if (result.playground.repoStatus) {
        console.log(`Repo status: ${result.playground.repoStatus}`);
      }
    }

    if (result.run?.summary) {
      console.log(`\nSummary: ${result.run.summary}`);
    }
    if (result.run?.outputTail) {
      console.log(`\n--- Output tail ---\n${result.run.outputTail}`);
    }
    if (result.verification) {
      const markerStatus = result.verification.markerFound ? "found" : "missing";
      console.log(`\nMarker: ${result.verification.marker} (${markerStatus})`);
      if (result.verification.warning) {
        console.log(`Warning: ${result.verification.warning}`);
      }
    }

    if (!result.ok) {
      process.exit(1);
    }
  });

// ==================== viber channels (enterprise channel webhooks) ====================

program
  .command("channels")
  .description("Start the enterprise channel server (DingTalk, WeCom, Discord, Feishu webhooks)")
  .option("-p, --port <port>", "Channel server port", "6009")
  .action(async (options) => {
    const { channelManager } = await import("../channels/manager");
    const { ChannelGateway } = await import("../channels/gateway");
    const { loadGatewayBootstrapConfig } = await import("../channels/config");
    const {
      registerBuiltinChannels,
      createChannelsFromConfig,
    } = await import("../channels/builtin");

    console.log(`
+-------------------------------------------------------+
|                  CHANNELS STARTING                      |
+-------------------------------------------------------+
`);

    const bootstrap = await loadGatewayBootstrapConfig({
      port: parseInt(options.port, 10),
    });

    registerBuiltinChannels();

    const context: ChannelRuntimeContext = {
      routeMessage: (message: InboundMessage) => channelManager.routeMessage(message),
      handleInterrupt: (signal: InterruptSignal) => channelManager.handleInterrupt(signal),
    };

    const channelInstances = createChannelsFromConfig(bootstrap.channels, context);
    const channelNames = channelInstances.map((channel) => channel.id);

    if (channelInstances.length === 0) {
      console.log(`
No channels configured. Set environment variables to enable channels:

DingTalk:
  DINGTALK_APP_KEY, DINGTALK_APP_SECRET, DINGTALK_ROBOT_CODE

WeCom:
  WECOM_CORP_ID, WECOM_AGENT_ID, WECOM_AGENT_SECRET
  WECOM_TOKEN, WECOM_ENCODING_AES_KEY (optional)

Discord:
  DISCORD_BOT_TOKEN (optional: DISCORD_APP_ID, DISCORD_ALLOW_GUILDS, DISCORD_ALLOW_CHANNELS)

Feishu:
  FEISHU_APP_ID, FEISHU_APP_SECRET (optional: FEISHU_VERIFICATION_TOKEN, FEISHU_DOMAIN)

Or configure channels from the OpenViber web and re-run: viber channels
`);
      process.exit(1);
    }

    const gateway = new ChannelGateway(bootstrap.gateway, channelInstances, channelManager);

    await gateway.start();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n[Channels] Shutting down...");
      await gateway.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n[Channels] Shutting down...");
      await gateway.stop();
      process.exit(0);
    });

    const basePath = bootstrap.gateway.basePath || "/";

    console.log(`
+-------------------------------------------------------+
|                  CHANNELS RUNNING                        |
+-------------------------------------------------------+
| Channels:     ${channelNames.join(", ").slice(0, 43).padEnd(43)} |
| Webhooks:     ${`${bootstrap.gateway.host}:${bootstrap.gateway.port}${basePath}`.slice(0, 43).padEnd(43)} |
| Status:       * Ready                                     |
+-------------------------------------------------------+

Listening for messages from enterprise channels...
Press Ctrl+C to stop.
`);
  });

// ==================== Helpers ====================

function formatSkillHealthReport(report: SkillHealthReport): string[] {
  if (!report || report.skills.length === 0) {
    return [];
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case "AVAILABLE":
        return "OK";
      case "NOT_AVAILABLE":
        return "MISSING";
      case "UNKNOWN":
        return "UNKNOWN";
      default:
        return status || "UNKNOWN";
    }
  };

  const lines: string[] = [];
  lines.push("");
  lines.push("Skill Health");
  lines.push("────────────────────────────────────");

  for (const skill of report.skills) {
    const name = (skill.name || skill.id).slice(0, 22);
    const status = statusLabel(skill.status);
    lines.push(`  ${name.padEnd(22)} ${status}`);

    if (skill.status !== "AVAILABLE") {
      const failed = skill.checks.filter(
        (check) => (check.required ?? true) && !check.ok,
      );
      if (failed.length === 0) {
        if (skill.summary) {
          lines.push(`    - ${skill.summary}`);
        }
      } else {
        for (const check of failed) {
          const detail = check.hint || check.message || "missing";
          lines.push(`    - ${check.label}: ${detail}`);
        }
      }
    }
  }

  lines.push("────────────────────────────────────");
  return lines;
}

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

interface SavedConfig {
  mode?: string;
  nodeId?: string;
  name?: string;
  gatewayUrl?: string;
  /** @deprecated Use gatewayUrl instead */
  boardUrl?: string;
  /** @deprecated Use gatewayUrl instead */
  hubUrl?: string;
  authToken?: string;
  webUrl?: string;
  onboardedAt?: string;
}

/**
 * Load saved config from ~/.openviber/config.yaml.
 * Returns null if file doesn't exist or is invalid.
 */
async function loadSavedConfig(): Promise<SavedConfig | null> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = YAML.parse(content) as SavedConfig;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
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
          "  /vibers               List connected tasks",
          "  /use <viberId>        Switch active task runtime",
          "  /reset                Clear local history (and session file)",
        ].join("\n"),
      );
      return "continue";
    case "vibers": {
      const vibers = await hubGetVibers(ctx.hubUrl);
      if (!vibers.connected || vibers.vibers.length === 0) {
        console.log("No tasks connected.");
        return "continue";
      }
      console.log("Connected tasks:");
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
        console.log(`Task runtime not found: ${next}`);
        return "continue";
      }
      ctx.setActiveViberId(next);
      console.log(`Active task runtime: ${next}`);
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
