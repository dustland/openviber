#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";

/**
 * Viber CLI - Command line interface for the Viber framework
 *
 * Commands:
 *   viber start    - Start the viber daemon (connect to command center)
 *   viber run      - Run a task locally without connection to command center
 *   viber gateway  - Start the API gateway server (legacy)
 */

import { program } from "commander";
import * as os from "os";
import * as fs from "fs/promises";
import * as path from "path";

const VERSION = "1.0.0";

program
  .name("openviber")
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

// ==================== Main ====================

program.parse();
