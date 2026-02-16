import { Command } from "commander";
import * as os from "os";
import * as path from "path";
import { loadSettings, saveSettings } from "../../skills/hub/settings";
import { OPENVIBER_DIR, getViberId, loadSavedConfig, isInteractiveTerminal } from "../common";

export const startCommand = new Command("start")
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
    const { loadOpenViberEnv } = await import("../auth");
    await loadOpenViberEnv();

    const { JobScheduler } = await import("../../daemon/scheduler");
    const { ViberController } = await import("../../daemon/controller");

    // Import skill tools to register them in the ToolRegistry
    const { registerSkillTools } = await import("../../tools/skill-tools");
    registerSkillTools();

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

    if (isInteractiveTerminal()) {
      const persistedSettings = await loadSettings();
      const proactiveSkillIds = new Set<string>(cliSkills);
      if (
        typeof options.primaryCodingCli === "string" &&
        options.primaryCodingCli.trim().length > 0
      ) {
        proactiveSkillIds.add(options.primaryCodingCli.trim());
      } else if (persistedSettings.primaryCodingCli) {
        proactiveSkillIds.add(persistedSettings.primaryCodingCli);
      }
      for (const skillId of persistedSettings.standaloneSkills || []) {
        proactiveSkillIds.add(skillId);
      }
      if (proactiveSkillIds.size > 0) {
        const { ensureSkillsReady } = await import("../auth");
        await ensureSkillsReady(Array.from(proactiveSkillIds));
      }
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

    // Start embedded gateway only in standalone mode.
    // In connected mode the external gateway (pnpm dev:gateway) is already running.
    const apiPort = parseInt(options.apiPort || "6009", 10);
    let embeddedGateway: import("../../gateway/server").GatewayServer | null = null;
    if (isStandaloneMode) {
      const { GatewayServer } = await import("../../gateway/server");
      embeddedGateway = new GatewayServer({ port: apiPort });
      await embeddedGateway.start();
      console.log(`[Viber] Local API ready on http://localhost:${apiPort}`);
    }

    // Start local WebSocket server for terminal streaming (always, both modes)
    const { LocalServer } = await import("../../daemon/local-server");
    const localServer = new LocalServer({ port: 6008 });
    await localServer.start();

    // Update cleanup to also stop local server and embedded gateway
    const fullCleanup = async () => {
      console.log("\n[Viber] Shutting down...");
      await localServer.stop();
      if (embeddedGateway) await embeddedGateway.stop();
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

    // Controller connects to the main gateway when available (connected mode),
    // otherwise falls back to the embedded gateway for standalone mode.
    const controller = new ViberController({
      serverUrl: serverUrl || `ws://localhost:${apiPort}/ws`,
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



    await controller.start();
  });
