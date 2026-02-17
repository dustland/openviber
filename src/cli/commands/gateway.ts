import { Command } from "commander";

const gatewayAction = async (options: {
  port: string;
  taskStore?: "memory" | "sqlite" | "supabase";
  viberStore?: "memory" | "sqlite" | "supabase";
  sqlitePath?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  apiToken?: string;
  allowUnauthLocalhost?: string;
  allowedOrigins?: string;
}) => {
  const { GatewayServer } = await import("../../gateway/server");

  const allowUnauthenticatedLocalhost =
    options.allowUnauthLocalhost == null
      ? undefined
      : options.allowUnauthLocalhost.toLowerCase() !== "false";
  const allowedOrigins = options.allowedOrigins
    ? options.allowedOrigins
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    : undefined;

  const gateway = new GatewayServer({
    port: parseInt(options.port, 10),
    taskStoreMode: options.taskStore,
    viberStoreMode: options.viberStore,
    taskStoreSqlitePath: options.sqlitePath,
    taskStoreSupabaseUrl: options.supabaseUrl,
    taskStoreSupabaseServiceRoleKey: options.supabaseServiceRoleKey,
    apiToken: options.apiToken,
    allowUnauthenticatedLocalhost,
    allowedOrigins,
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

  const w = 55;
  const gLine = (s: string) => `| ${s.padEnd(w)} |`;
  console.log(`
+${"-".repeat(w + 2)}+
| ${"GATEWAY RUNNING".padStart(Math.floor((w + 15) / 2)).padEnd(w)} |
+${"-".repeat(w + 2)}+
${gLine("REST API:     http://localhost:" + options.port)}
${gLine("WebSocket:    ws://localhost:" + options.port + "/ws")}
${gLine("Status:       * Ready for task connections")}
+${"-".repeat(w + 2)}+

Waiting for Viber runtimes to connect...
Press Ctrl+C to stop.
  `);
};

export const gatewayCommand = new Command("gateway")
  .description("Start the gateway (central coordinator for Viber runtimes)")
  .option("-p, --port <port>", "Port to listen on", "6009")
  .option(
    "--task-store <mode>",
    "Task store backend (memory|sqlite|supabase)",
  )
  .option(
    "--viber-store <mode>",
    "Viber metadata store backend (memory|sqlite|supabase)",
  )
  .option(
    "--sqlite-path <path>",
    "SQLite file path (used when --task-store=sqlite)",
  )
  .option(
    "--supabase-url <url>",
    "Supabase URL (used when --task-store=supabase)",
  )
  .option(
    "--supabase-service-role-key <key>",
    "Supabase service-role key (used when --task-store=supabase)",
  )
  .option(
    "--api-token <token>",
    "Bearer token required for gateway REST/WS access",
  )
  .option(
    "--allow-unauth-localhost <bool>",
    "Allow localhost clients without token when api-token is set (default: true)",
  )
  .option(
    "--allowed-origins <origins>",
    "Comma-separated CORS allow-list (e.g. https://app.example.com)",
  )
  .action(gatewayAction);

export const boardCommand = new Command("board")
  .description("(deprecated: use 'gateway') Start the gateway")
  .option("-p, --port <port>", "Port to listen on", "6009")
  .option(
    "--task-store <mode>",
    "Task store backend (memory|sqlite|supabase)",
  )
  .option(
    "--viber-store <mode>",
    "Viber metadata store backend (memory|sqlite|supabase)",
  )
  .option(
    "--sqlite-path <path>",
    "SQLite file path (used when --task-store=sqlite)",
  )
  .option(
    "--supabase-url <url>",
    "Supabase URL (used when --task-store=supabase)",
  )
  .option(
    "--supabase-service-role-key <key>",
    "Supabase service-role key (used when --task-store=supabase)",
  )
  .option(
    "--api-token <token>",
    "Bearer token required for gateway REST/WS access",
  )
  .option(
    "--allow-unauth-localhost <bool>",
    "Allow localhost clients without token when api-token is set (default: true)",
  )
  .option(
    "--allowed-origins <origins>",
    "Comma-separated CORS allow-list (e.g. https://app.example.com)",
  )
  .action(gatewayAction);

export const hubCommand = new Command("hub")
  .description("(deprecated: use 'gateway') Start the gateway")
  .option("-p, --port <port>", "Port to listen on", "6009")
  .option(
    "--task-store <mode>",
    "Task store backend (memory|sqlite|supabase)",
  )
  .option(
    "--viber-store <mode>",
    "Viber metadata store backend (memory|sqlite|supabase)",
  )
  .option(
    "--sqlite-path <path>",
    "SQLite file path (used when --task-store=sqlite)",
  )
  .option(
    "--supabase-url <url>",
    "Supabase URL (used when --task-store=supabase)",
  )
  .option(
    "--supabase-service-role-key <key>",
    "Supabase service-role key (used when --task-store=supabase)",
  )
  .option(
    "--api-token <token>",
    "Bearer token required for gateway REST/WS access",
  )
  .option(
    "--allow-unauth-localhost <bool>",
    "Allow localhost clients without token when api-token is set (default: true)",
  )
  .option(
    "--allowed-origins <origins>",
    "Comma-separated CORS allow-list (e.g. https://app.example.com)",
  )
  .action(gatewayAction);
