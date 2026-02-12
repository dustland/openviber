import { Command } from "commander";

export const loginCommand = new Command("login")
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

export const authCommand = new Command("auth")
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
    const { runGoogleAuth, loadOpenViberEnv } = await import("../auth");
    await loadOpenViberEnv();
    await runGoogleAuth({ noBrowser: options.browser === false });
  });

authCommand
  .command("apikey")
  .description("Interactively configure an LLM provider API key")
  .action(async () => {
    const { runApiKeySetup } = await import("../auth");
    await runApiKeySetup();
  });

authCommand
  .command("status")
  .description("Show current API keys and OAuth connection status")
  .action(async () => {
    const { showAuthStatus, loadOpenViberEnv } = await import("../auth");
    await loadOpenViberEnv();
    await showAuthStatus();
  });

authCommand
  .command("revoke")
  .description("Disconnect a local OAuth provider")
  .argument("<provider>", "OAuth provider to revoke (e.g. google)")
  .action(async (provider: string) => {
    const { revokeOAuthProvider } = await import("../auth");
    await revokeOAuthProvider(provider);
  });
