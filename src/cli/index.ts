import { startGateway } from "../server/gateway";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "start" || !command) {
    const port = parseInt(process.env.PORT || "3000", 10);
    console.log(`Starting Viber Gateway on port ${port}...`);
    startGateway(port);
  } else {
    console.error(`Unknown command: ${command}`);
    console.log("Usage: viber [start]");
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
