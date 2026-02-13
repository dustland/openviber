import { Command } from "commander";

const gatewayAction = async (options: { port: string }) => {
  const { GatewayServer } = await import("../../gateway/server");

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
  .option("-p, --port <port>", "Port to listen on", "6007")
  .action(gatewayAction);

export const boardCommand = new Command("board")
  .description("(deprecated: use 'gateway') Start the gateway")
  .option("-p, --port <port>", "Port to listen on", "6007")
  .action(gatewayAction);

export const hubCommand = new Command("hub")
  .description("(deprecated: use 'gateway') Start the gateway")
  .option("-p, --port <port>", "Port to listen on", "6007")
  .action(gatewayAction);
