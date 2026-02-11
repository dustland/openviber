/**
 * CLI Auth Module
 *
 * Provides interactive API key setup and OAuth flows (Google/Gmail) for the
 * OpenViber CLI.  Supports two environments:
 *
 *  - **GUI mode** – opens the system browser for OAuth consent and starts a
 *    tiny local HTTP server to receive the callback.
 *  - **Headless / SSH mode** – prints the consent URL so the user can open it
 *    on another machine, then asks them to paste the redirect URL that contains
 *    the authorization code.
 *
 * When the node is connected to the OpenViber web app (onboarded), the CLI
 * delegates to the web app for OAuth and polls for token availability.
 */

import * as http from "http";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { exec, spawn } from "child_process";
import { getViberRoot } from "../config";
import { loadSettings, saveSettings } from "../skills/hub/settings";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** Resolve the OpenViber root dir (testable via config mock). */
function getOpenViberDir(): string {
  return getViberRoot();
}

function getEnvFile(): string {
  return path.join(getOpenViberDir(), ".env");
}

function getConfigFile(): string {
  return path.join(getOpenViberDir(), "config.yaml");
}

/** Port used by the local callback server (standalone OAuth). */
export const LOCAL_CALLBACK_PORT = 9876;
export const LOCAL_CALLBACK_PATH = "/callback";
export const LOCAL_REDIRECT_URI = `http://localhost:${LOCAL_CALLBACK_PORT}${LOCAL_CALLBACK_PATH}`;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Default Gmail scopes – matches the web app. */
export const GOOGLE_GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

/** Supported LLM provider keys that can be configured interactively. */
export const PROVIDER_ENV_KEYS: Record<string, { envVar: string; url: string }> = {
  openrouter: {
    envVar: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/keys",
  },
  anthropic: {
    envVar: "ANTHROPIC_API_KEY",
    url: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    envVar: "OPENAI_API_KEY",
    url: "https://platform.openai.com/api-keys",
  },
  deepseek: {
    envVar: "DEEPSEEK_API_KEY",
    url: "https://platform.deepseek.com/api_keys",
  },
};

// ────────────────────────────────────────────────────────────
// Headless / GUI detection
// ────────────────────────────────────────────────────────────

/**
 * Detect whether we are running in a headless environment (SSH session,
 * no display, container, etc.) where opening a browser is not possible.
 */
export function isHeadless(): boolean {
  // Explicit SSH session indicators
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return true;

  // Linux: no DISPLAY and no WAYLAND_DISPLAY
  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  ) {
    return true;
  }

  return false;
}

/**
 * Attempt to open a URL in the default browser.
 * Returns `true` if the command was dispatched (not necessarily successful).
 */
export function openBrowser(url: string): boolean {
  try {
    if (process.platform === "darwin") {
      exec(`open "${url}"`);
    } else if (process.platform === "linux") {
      exec(`xdg-open "${url}"`);
    } else if (process.platform === "win32") {
      exec(`start "" "${url}"`);
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// Readline helpers
// ────────────────────────────────────────────────────────────

function createRl(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function getTmuxInstallCommandForPlatform(): string | null {
  if (process.platform === "darwin") {
    return "brew install tmux";
  }
  if (process.platform === "linux") {
    return "sudo apt-get update && sudo apt-get install -y tmux";
  }
  return null;
}

function getAutoInstallCommand(skillId: string, checkId: string): string | null {
  if (checkId === "tmux") {
    return getTmuxInstallCommandForPlatform();
  }
  if (skillId === "cursor-agent" && checkId === "cursor-cli") {
    return "curl https://cursor.com/install -fsS | bash";
  }
  if (skillId === "codex-cli" && checkId === "codex-cli") {
    return "pnpm add -g @openai/codex";
  }
  if (skillId === "gemini-cli" && checkId === "gemini-cli") {
    return "npm install -g @google/gemini-cli";
  }
  if (skillId === "github" && checkId === "gh-cli") {
    if (process.platform === "darwin") return "brew install gh";
    if (process.platform === "linux") {
      return "sudo apt-get update && sudo apt-get install -y gh";
    }
    return null;
  }
  if (skillId === "railway" && checkId === "railway-cli") {
    return "npm install -g @railway/cli";
  }
  return null;
}

function getAuthCommand(skillId: string, checkId: string): string | null {
  if (skillId === "cursor-agent" && checkId === "cursor-auth") {
    return "agent login || cursor-agent login";
  }
  if (skillId === "codex-cli" && checkId === "codex-auth") {
    return "codex login";
  }
  if (skillId === "gemini-cli" && checkId === "gemini-auth") {
    return "gemini";
  }
  if (skillId === "github" && checkId === "gh-auth") {
    return "gh auth login -h github.com";
  }
  if (skillId === "railway" && checkId === "railway-auth") {
    return "railway login";
  }
  return null;
}

function getAuthEnvVar(skillId: string, checkId: string): string | null {
  if (skillId === "cursor-agent" && checkId === "cursor-auth") {
    return "CURSOR_API_KEY";
  }
  if (skillId === "codex-cli" && checkId === "codex-auth") {
    return "OPENAI_API_KEY";
  }
  if (skillId === "gemini-cli" && checkId === "gemini-auth") {
    return "GEMINI_API_KEY";
  }
  if (skillId === "github" && checkId === "gh-auth") {
    return "GH_TOKEN";
  }
  if (skillId === "railway" && checkId === "railway-auth") {
    return "RAILWAY_TOKEN";
  }
  return null;
}

async function runInteractiveShellCommand(command: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    child.once("close", (code) => resolve((code ?? 1) === 0));
    child.once("error", () => resolve(false));
  });
}

// ────────────────────────────────────────────────────────────
// Google OAuth URL builder
// ────────────────────────────────────────────────────────────

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Build the Google OAuth consent URL for the CLI local-callback flow.
 */
export function buildGoogleAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: LOCAL_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for Google access + refresh tokens.
 */
export async function exchangeGoogleCode(
  code: string,
  config: GoogleOAuthConfig,
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: LOCAL_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in,
  };
}

// ────────────────────────────────────────────────────────────
// Extract code from redirect URL (headless paste)
// ────────────────────────────────────────────────────────────

/**
 * Parse the authorization code from a pasted redirect URL.
 * Accepts either a full URL or just the code string.
 */
export function extractCodeFromUrl(input: string): string | null {
  const trimmed = input.trim();

  // If it looks like a URL, parse the `code` query param
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("code");
    } catch {
      return null;
    }
  }

  // If it's not a URL, treat the whole input as the code (user may have
  // extracted it manually)
  if (trimmed.length > 0) {
    return trimmed;
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// Local callback HTTP server
// ────────────────────────────────────────────────────────────

/**
 * Start a temporary HTTP server that waits for the Google OAuth callback.
 * Resolves with the authorization code when received.
 */
export function startCallbackServer(
  expectedState: string,
): Promise<{ code: string; server: http.Server }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith(LOCAL_CALLBACK_PATH)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const url = new URL(req.url, `http://localhost:${LOCAL_CALLBACK_PORT}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization failed</h2>" +
            `<p>Error: ${error}</p>` +
            "<p>You can close this tab.</p></body></html>",
        );
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Missing authorization code</h2>" +
            "<p>You can close this tab.</p></body></html>",
        );
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Invalid state parameter</h2>" +
            "<p>Possible CSRF attack. Please try again.</p></body></html>",
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h2>Authorization successful!</h2>" +
          "<p>You can close this tab and return to the terminal.</p></body></html>",
      );

      resolve({ code, server });
    });

    server.on("error", (err) => {
      reject(new Error(`Failed to start callback server: ${err.message}`));
    });

    server.listen(LOCAL_CALLBACK_PORT, "127.0.0.1", () => {
      // Server ready
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timed out (5 minutes). Please try again."));
    }, 5 * 60 * 1000);
  });
}

// ────────────────────────────────────────────────────────────
// Resolve Google OAuth credentials
// ────────────────────────────────────────────────────────────

/**
 * Resolve Google Client ID & Secret from environment variables.
 */
export function resolveGoogleCredentials(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Standalone Google OAuth flow (full)
// ────────────────────────────────────────────────────────────

/**
 * Run the standalone Google OAuth flow.
 *
 * - GUI: opens browser + local callback server
 * - Headless: prints URL + asks user to paste redirect URL
 */
export async function runStandaloneGoogleOAuth(options: {
  noBrowser?: boolean;
}): Promise<void> {
  const creds = resolveGoogleCredentials();
  if (!creds) {
    console.error(
      "\n  Google OAuth credentials not found.\n" +
        "  Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.\n" +
        "\n  You can create credentials at:\n" +
        "  https://console.cloud.google.com/apis/credentials\n" +
        "  (Choose \"Desktop app\" as the application type)\n",
    );
    process.exit(1);
  }

  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const consentUrl = buildGoogleAuthUrl(creds.clientId, state);

  const headless = options.noBrowser || isHeadless();

  if (headless) {
    await runHeadlessFlow(consentUrl, state, creds);
  } else {
    await runBrowserFlow(consentUrl, state, creds);
  }
}

async function runBrowserFlow(
  consentUrl: string,
  state: string,
  creds: GoogleOAuthConfig,
): Promise<void> {
  console.log("\n  Starting local callback server...");

  const serverPromise = startCallbackServer(state);

  console.log("  Opening browser for Google authorization...\n");
  const opened = openBrowser(consentUrl);

  if (!opened) {
    console.log("  Could not open browser. Please visit this URL manually:\n");
    console.log(`  ${consentUrl}\n`);
  }

  console.log("  Waiting for authorization...");

  try {
    const { code, server } = await serverPromise;
    server.close();

    console.log("  Authorization received! Exchanging code for tokens...\n");

    const tokens = await exchangeGoogleCode(code, creds);
    await saveGoogleTokens(tokens.accessToken, tokens.refreshToken);

    console.log("  Google account connected successfully!");
    console.log("  Tokens saved to ~/.openviber/settings.yaml\n");
  } catch (err: any) {
    console.error(`\n  OAuth failed: ${err.message}\n`);
    process.exit(1);
  }
}

async function runHeadlessFlow(
  consentUrl: string,
  _state: string,
  creds: GoogleOAuthConfig,
): Promise<void> {
  console.log("\n  Headless mode detected (SSH / no display).\n");
  console.log("  Open this URL in a browser on another machine:\n");
  console.log(`  ${consentUrl}\n`);
  console.log(
    "  After authorizing, the browser will redirect to a localhost URL",
  );
  console.log(
    "  that won't load. Copy the FULL URL from the browser address bar",
  );
  console.log("  and paste it below.\n");

  const rl = createRl();
  try {
    const input = await ask(rl, "  Paste the redirect URL here: ");
    rl.close();

    const code = extractCodeFromUrl(input);
    if (!code) {
      console.error("\n  Could not extract authorization code from the URL.");
      console.error("  Please try again.\n");
      process.exit(1);
    }

    console.log("\n  Exchanging code for tokens...");
    const tokens = await exchangeGoogleCode(code, creds);
    await saveGoogleTokens(tokens.accessToken, tokens.refreshToken);

    console.log("  Google account connected successfully!");
    console.log("  Tokens saved to ~/.openviber/settings.yaml\n");
  } catch (err: any) {
    rl.close();
    console.error(`\n  OAuth failed: ${err.message}\n`);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────
// Connected-mode Google OAuth flow
// ────────────────────────────────────────────────────────────

interface SavedConfig {
  webUrl?: string;
  authToken?: string;
  nodeId?: string;
  [key: string]: unknown;
}

/**
 * Load saved config from ~/.openviber/config.yaml.
 */
async function loadSavedConfig(): Promise<SavedConfig | null> {
  try {
    const { default: YAML } = await import("yaml");
    const content = await fs.readFile(getConfigFile(), "utf8");
    const parsed = YAML.parse(content) as SavedConfig;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Run the connected-mode OAuth flow:
 * open browser to web app's integrations page, poll node config endpoint
 * for OAuth token appearance.
 */
export async function runConnectedGoogleOAuth(
  webUrl: string,
  authToken: string,
  nodeId: string,
  options: { noBrowser?: boolean },
): Promise<void> {
  const oauthPageUrl = `${webUrl}/settings/integrations`;

  const headless = options.noBrowser || isHeadless();

  if (headless) {
    console.log("\n  Headless mode detected (SSH / no display).\n");
    console.log("  Open this URL in a browser to connect Google:\n");
    console.log(`  ${oauthPageUrl}\n`);
  } else {
    console.log("\n  Opening browser to connect Google via web app...\n");
    const opened = openBrowser(oauthPageUrl);
    if (!opened) {
      console.log("  Could not open browser. Visit this URL manually:\n");
      console.log(`  ${oauthPageUrl}\n`);
    }
  }

  console.log("  Waiting for Google connection...");
  console.log("  (Press Ctrl+C to cancel)\n");

  // Poll the node config endpoint using Bearer auth (works without session)
  const maxAttempts = 60; // 5 minutes at 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);

    try {
      const res = await fetch(`${webUrl}/api/nodes/${nodeId}/config`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) continue;

      const data = (await res.json()) as {
        oauthConnections?: Array<{
          provider: string;
          accessToken?: string;
        }>;
      };

      const google = data.oauthConnections?.find(
        (c) => c.provider === "google",
      );
      if (google?.accessToken) {
        console.log("\n  Google account connected successfully!");
        console.log(
          "  Tokens are stored encrypted on the web and will be pulled on viber start.\n",
        );
        return;
      }
    } catch {
      // Network error, keep polling
    }

    // Show progress dots
    process.stdout.write(".");
  }

  console.log(
    "\n\n  Timed out waiting for connection. You can complete it later at:",
  );
  console.log(`  ${oauthPageUrl}\n`);
}

// ────────────────────────────────────────────────────────────
// Token storage helpers
// ────────────────────────────────────────────────────────────

/**
 * Save Google OAuth tokens to settings.yaml for standalone use.
 */
async function saveGoogleTokens(
  accessToken: string,
  refreshToken: string | null,
): Promise<void> {
  const settings = await loadSettings();
  settings.oauthTokens = {
    ...(settings.oauthTokens || {}),
    google: {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
    },
  };
  await saveSettings(settings);
}

// ────────────────────────────────────────────────────────────
// Interactive API key setup
// ────────────────────────────────────────────────────────────

/**
 * Run interactive API key configuration.
 * Prompts the user to select a provider and enter their API key.
 * Saves to ~/.openviber/.env.
 */
export async function runApiKeySetup(): Promise<void> {
  const rl = createRl();

  try {
    const providers = Object.keys(PROVIDER_ENV_KEYS);
    console.log("\n  Available LLM providers:\n");
    providers.forEach((p, i) => {
      const currentValue = process.env[PROVIDER_ENV_KEYS[p].envVar];
      const status = currentValue ? " (configured)" : "";
      console.log(`    ${i + 1}. ${p}${status}`);
    });

    console.log();
    const choice = await ask(
      rl,
      `  Select provider [1-${providers.length}] or name: `,
    );

    // Resolve by number or name
    let providerName: string | undefined;
    const choiceNum = parseInt(choice, 10);
    if (choiceNum >= 1 && choiceNum <= providers.length) {
      providerName = providers[choiceNum - 1];
    } else {
      providerName = providers.find(
        (p) => p.toLowerCase() === choice.toLowerCase(),
      );
    }

    if (!providerName) {
      console.error(`\n  Unknown provider: ${choice}\n`);
      rl.close();
      process.exit(1);
    }

    const provider = PROVIDER_ENV_KEYS[providerName];
    console.log(`\n  Get your API key at: ${provider.url}\n`);

    const apiKey = await ask(rl, `  Paste your ${providerName} API key: `);
    rl.close();

    if (!apiKey) {
      console.error("\n  No key provided. Aborting.\n");
      process.exit(1);
    }

    // Save to ~/.openviber/.env
    await saveApiKeyToEnv(provider.envVar, apiKey);

    // Also set in current process
    process.env[provider.envVar] = apiKey;

    console.log(`\n  Saved ${provider.envVar} to ${getEnvFile()}`);
    console.log(
      "  It will be auto-loaded on next 'viber start'.\n",
    );
  } catch (err: any) {
    rl.close();
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * Append or update an environment variable in ~/.openviber/.env.
 */
export async function saveApiKeyToEnv(
  key: string,
  value: string,
): Promise<void> {
  const envFile = getEnvFile();
  await fs.mkdir(path.dirname(envFile), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(envFile, "utf8");
  } catch {
    // File doesn't exist yet
  }

  // Parse existing entries
  const lines = existing.split("\n");
  let found = false;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`) || trimmed.startsWith(`${key} =`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    // Append to end
    if (existing.length > 0 && !existing.endsWith("\n")) {
      updated.push("");
    }
    updated.push(`${key}=${value}`);
  }

  await fs.writeFile(envFile, updated.join("\n"), "utf8");
}

// ────────────────────────────────────────────────────────────
// Auth status
// ────────────────────────────────────────────────────────────

/**
 * Display current auth status: API keys and OAuth connections.
 */
export async function showAuthStatus(): Promise<void> {
  console.log("\n  API Keys:\n");

  for (const [name, info] of Object.entries(PROVIDER_ENV_KEYS)) {
    const value = process.env[info.envVar];
    if (value) {
      const masked = value.slice(0, 8) + "..." + value.slice(-4);
      console.log(`    ${name}: ${masked} (${info.envVar})`);
    } else {
      console.log(`    ${name}: not set (${info.envVar})`);
    }
  }

  console.log("\n  OAuth Connections:\n");

  const settings = await loadSettings();
  const oauthTokens = settings.oauthTokens || {};

  if (Object.keys(oauthTokens).length === 0) {
    console.log("    No local OAuth connections.\n");
  } else {
    for (const [provider, tokens] of Object.entries(oauthTokens)) {
      const hasRefresh = !!tokens.refreshToken;
      const masked =
        tokens.accessToken.slice(0, 8) + "..." + tokens.accessToken.slice(-4);
      console.log(
        `    ${provider}: connected (access: ${masked}, refresh: ${hasRefresh ? "yes" : "no"})`,
      );
    }
    console.log();
  }

  // Also check connected mode
  const savedConfig = await loadSavedConfig();
  if (savedConfig?.webUrl) {
    console.log(`  Web app: ${savedConfig.webUrl}`);
    console.log(
      "  (OAuth connections in the web app are pulled automatically on viber start)\n",
    );
  }
}

// ────────────────────────────────────────────────────────────
// Revoke OAuth
// ────────────────────────────────────────────────────────────

/**
 * Revoke a local OAuth connection.
 */
export async function revokeOAuthProvider(provider: string): Promise<void> {
  const settings = await loadSettings();

  if (!settings.oauthTokens?.[provider]) {
    console.error(`\n  No local OAuth connection found for: ${provider}\n`);
    process.exit(1);
  }

  delete settings.oauthTokens[provider];
  await saveSettings(settings);

  console.log(`\n  Disconnected ${provider} OAuth tokens from local settings.`);
  console.log("  Note: this does not revoke the token with the provider.\n");
}

// ────────────────────────────────────────────────────────────
// Top-level command router
// ────────────────────────────────────────────────────────────

/**
 * Run the Google OAuth flow, choosing connected or standalone mode
 * based on saved config.
 */
export async function runGoogleAuth(options: {
  noBrowser?: boolean;
}): Promise<void> {
  const savedConfig = await loadSavedConfig();

  if (savedConfig?.webUrl && savedConfig?.authToken && savedConfig?.nodeId) {
    // Connected mode — delegate to web app
    console.log("[Auth] Connected mode — using web app for Google OAuth");
    await runConnectedGoogleOAuth(
      savedConfig.webUrl,
      savedConfig.authToken,
      savedConfig.nodeId,
      options,
    );
  } else {
    // Standalone mode — local OAuth flow
    console.log("[Auth] Standalone mode — local Google OAuth flow");
    await runStandaloneGoogleOAuth(options);
  }
}

// ────────────────────────────────────────────────────────────
// .env auto-loader
// ────────────────────────────────────────────────────────────

/**
 * Load environment variables from ~/.openviber/.env if it exists.
 * Does NOT override variables already set in the current process.
 */
export async function loadOpenViberEnv(): Promise<void> {
  try {
    const content = await fs.readFile(getEnvFile(), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();

      // Do not override existing env vars
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist — that's fine
  }
}

// ────────────────────────────────────────────────────────────
// Prompt helpers
// ────────────────────────────────────────────────────────────

/**
 * Prompt user for a yes/no answer.  Defaults to `defaultValue` on empty input.
 */
export function promptYesNo(
  rl: readline.Interface,
  question: string,
  defaultValue = true,
): Promise<boolean> {
  const suffix = defaultValue ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    rl.question(`${question} ${suffix} `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultValue);
      else resolve(a === "y" || a === "yes");
    });
  });
}

/**
 * Prompt user to retry (after external action) or skip.
 * Returns `true` to retry, `false` to skip.
 */
export function promptRetryOrSkip(
  rl: readline.Interface,
  instruction: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n    ${instruction}`);
    rl.question("    Press Enter to retry, or s to skip: ", (answer) => {
      resolve(answer.trim().toLowerCase() !== "s");
    });
  });
}

// ────────────────────────────────────────────────────────────
// LLM API key detection & prompt
// ────────────────────────────────────────────────────────────

/**
 * Check whether any LLM provider API key is configured.
 */
export function hasAnyLlmKey(): boolean {
  return Object.values(PROVIDER_ENV_KEYS).some(
    (info) => !!process.env[info.envVar]?.trim(),
  );
}

/**
 * Prompt the user to set up an LLM API key if none is configured.
 * This is the first step of the onboarding wizard.
 */
export async function runLlmKeyPrompt(): Promise<void> {
  if (hasAnyLlmKey()) {
    const configured = Object.entries(PROVIDER_ENV_KEYS)
      .filter(([, info]) => !!process.env[info.envVar]?.trim())
      .map(([name]) => name);
    console.log(`\n  LLM API key: ${configured.join(", ")} configured`);
    return;
  }

  console.log("\n  No LLM API key detected. OpenViber needs one to power its AI.\n");

  const rl = createRl();
  const providers = Object.keys(PROVIDER_ENV_KEYS);

  providers.forEach((p, i) => {
    const rec = p === "openrouter" ? " (recommended)" : "";
    console.log(`    ${i + 1}. ${p}${rec}`);
  });
  console.log();

  const choice = await ask(
    rl,
    `  Select provider [1-${providers.length}] or Enter to skip: `,
  );

  if (!choice) {
    rl.close();
    console.log(
      "  Skipped. You can set it later with: viber auth apikey\n",
    );
    return;
  }

  let providerName: string | undefined;
  const choiceNum = parseInt(choice, 10);
  if (choiceNum >= 1 && choiceNum <= providers.length) {
    providerName = providers[choiceNum - 1];
  } else {
    providerName = providers.find(
      (p) => p.toLowerCase() === choice.toLowerCase(),
    );
  }

  if (!providerName) {
    rl.close();
    console.log(`  Unknown provider: ${choice}. Skipping.\n`);
    return;
  }

  const provider = PROVIDER_ENV_KEYS[providerName];
  console.log(`\n  Get your API key at: ${provider.url}\n`);

  const apiKey = await ask(rl, `  Paste your ${providerName} API key: `);
  rl.close();

  if (!apiKey) {
    console.log("  No key provided. Skipping.\n");
    return;
  }

  await saveApiKeyToEnv(provider.envVar, apiKey);
  process.env[provider.envVar] = apiKey;
  console.log(`\n  Saved ${provider.envVar} to ${getEnvFile()}\n`);
}

// ────────────────────────────────────────────────────────────
// Skill picker
// ────────────────────────────────────────────────────────────

/** Status label for display in the skill picker. */
export function getSkillStatusLabel(
  result: import("../skills/health").SkillHealthResult,
): { label: string; detail: string } {
  if (result.status === "AVAILABLE") {
    return { label: "READY", detail: "" };
  }
  if (result.status === "UNKNOWN") {
    return { label: "UNKNOWN", detail: "" };
  }

  // Categorize the failure
  const failed = result.checks.filter(
    (c) => (c.required ?? true) && !c.ok,
  );
  const hasOAuth = failed.some((c) => c.actionType === "oauth");
  const hasBinary = failed.some((c) => c.actionType === "binary");

  if (hasOAuth && !hasBinary) {
    const oauthCheck = failed.find((c) => c.actionType === "oauth");
    return {
      label: "NEEDS SETUP",
      detail: oauthCheck?.label || "OAuth required",
    };
  }

  // Show the first failing check as detail
  const firstFail = failed[0];
  return {
    label: "MISSING",
    detail: firstFail?.label || result.summary,
  };
}

/**
 * Interactive skill picker.
 *
 * Displays all skills with live health status, lets the user toggle selection
 * with numbers, refresh with `r`, and confirm with Enter.
 *
 * Returns the IDs of the selected skills.
 */
export async function runSkillPicker(
  report: import("../skills/health").SkillHealthReport,
  refreshFn: () => Promise<import("../skills/health").SkillHealthReport>,
): Promise<{ selectedIds: string[]; report: import("../skills/health").SkillHealthReport }> {
  let currentReport = report;
  // Pre-select skills that are AVAILABLE
  const selected = new Set<string>(
    currentReport.skills
      .filter((s) => s.status === "AVAILABLE")
      .map((s) => s.id),
  );

  const rl = createRl();

  const printList = () => {
    console.log(
      "\n  Select skills to enable (toggle with number, r=refresh, Enter=confirm):\n",
    );
    currentReport.skills.forEach((skill, i) => {
      const check = selected.has(skill.id) ? "x" : " ";
      const num = String(i + 1).padStart(2);
      const name = (skill.name || skill.id).padEnd(18);
      const { label, detail } = getSkillStatusLabel(skill);
      const detailStr = detail ? `  (${detail})` : "";
      console.log(`    [${check}] ${num}. ${name} ${label}${detailStr}`);
    });
    console.log();
  };

  printList();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask(rl, "  > ");

    if (input === "") {
      // Confirm
      break;
    }

    if (input.toLowerCase() === "r") {
      console.log("    Refreshing...");
      currentReport = await refreshFn();
      printList();
      continue;
    }

    const num = parseInt(input, 10);
    if (num >= 1 && num <= currentReport.skills.length) {
      const skillId = currentReport.skills[num - 1].id;
      if (selected.has(skillId)) {
        selected.delete(skillId);
      } else {
        selected.add(skillId);
      }
      printList();
      continue;
    }

    console.log(
      `    Invalid input. Enter 1-${currentReport.skills.length}, r, or Enter.`,
    );
  }

  rl.close();
  return {
    selectedIds: Array.from(selected),
    report: currentReport,
  };
}

// ────────────────────────────────────────────────────────────
// Skill setup walker
// ────────────────────────────────────────────────────────────

/**
 * Walk selected skills that have unmet requirements and interactively
 * resolve them (prompt for keys, run OAuth, show install commands with retry).
 */
export async function runSkillSetup(
  selectedIds: string[],
  report: import("../skills/health").SkillHealthReport,
): Promise<void> {
  const selectedWithIssues = report.skills.filter(
    (s) => selectedIds.includes(s.id) && s.status !== "AVAILABLE",
  );

  if (selectedWithIssues.length === 0) {
    console.log("\n  All selected skills are ready!\n");
    return;
  }

  console.log(`\n  Setting up ${selectedWithIssues.length} skill(s)...\n`);

  const rl = createRl();
  const recheckCheck = async (
    skillInfo: { id: string; name?: string },
    checkId: string,
  ): Promise<boolean> => {
    const { checkSkillHealth } = await import("../skills/health");
    const recheck = await checkSkillHealth({
      id: skillInfo.id,
      name: skillInfo.name,
    });
    const recheckItem = recheck.checks.find((c) => c.id === checkId);
    return Boolean(recheckItem?.ok);
  };

  for (const skill of selectedWithIssues) {
    const failedChecks = skill.checks.filter(
      (c) => (c.required ?? true) && !c.ok,
    );

    if (failedChecks.length === 0) continue;

    console.log(`  ── ${skill.name || skill.id} ──`);

    for (const check of failedChecks) {
      switch (check.actionType) {
        case "oauth": {
          console.log(`    ${check.label}`);
          const wantOAuth = await promptYesNo(
            rl,
            "    Connect now?",
            true,
          );
          if (wantOAuth) {
            rl.close();
            // Run the Google OAuth flow (reuses existing auth module)
            await runGoogleAuth({ noBrowser: isHeadless() });
            // Re-create rl since runGoogleAuth may have used stdin
            const newRl = createRl();
            Object.assign(rl, newRl);
          } else {
            console.log(
              "    Skipped. Run `viber auth google` later.\n",
            );
          }
          break;
        }

        case "env": {
          console.log(`    ${check.label}: ${check.message || "not set"}`);
          // Try to extract the env var name from the check
          const envVarMatch = check.message?.match(
            /^(\w+)\s+(not set|or)/,
          );
          const envVarName = envVarMatch?.[1];
          if (envVarName) {
            const value = await ask(
              rl,
              `    Paste ${envVarName} (or Enter to skip): `,
            );
            if (value) {
              await saveApiKeyToEnv(envVarName, value);
              process.env[envVarName] = value;
              console.log(`    Saved to ${getEnvFile()}\n`);
            } else {
              console.log("    Skipped.\n");
            }
          } else {
            console.log(`    ${check.hint || "Set the required env var."}\n`);
          }
          break;
        }

        case "binary": {
          console.log(
            `    ${check.label}: ${check.message || "not found"}`,
          );
          const autoInstallCommand = getAutoInstallCommand(skill.id, check.id);
          if (autoInstallCommand) {
            const installNow = await promptYesNo(
              rl,
              "    Should I install this for you now?",
              true,
            );
            if (installNow) {
              console.log(`\n    Running: ${autoInstallCommand}\n`);
              const installed = await runInteractiveShellCommand(autoInstallCommand);
              if (!installed) {
                console.log(
                  "    Install command failed. You can retry manually.\n",
                );
              } else {
                const ok = await recheckCheck(skill, check.id);
                if (ok) {
                  console.log(`    ${check.label}: OK\n`);
                  break;
                }
              }
            }
          }

          if (check.hint) {
            const shouldRetry = await promptRetryOrSkip(
              rl,
              check.hint,
            );
            if (shouldRetry) {
              const ok = await recheckCheck(skill, check.id);
              if (ok) {
                console.log(`    ${check.label}: OK\n`);
              } else {
                console.log(
                  `    Still not found. You can install it later.\n`,
                );
              }
            }
          } else {
            console.log("    Skipped (no install instructions).\n");
          }
          break;
        }

        case "auth_cli": {
          console.log(
            `    ${check.label}: ${check.message || "not authenticated"}`,
          );
          const authCommand = getAuthCommand(skill.id, check.id);
          const authEnvVar = getAuthEnvVar(skill.id, check.id);
          const setupNow = await promptYesNo(
            rl,
            "    Should I set up auth for you now?",
            true,
          );
          if (setupNow) {
            const mode = (
              await ask(
                rl,
                "    Press Enter to start login, type 'copy' to show command, 'token' to paste key, or 's' to skip: ",
              )
            )
              .trim()
              .toLowerCase();

            if (mode === "copy") {
              if (authCommand) {
                console.log("\n    Run this command in your terminal:");
                console.log(`    ${authCommand}\n`);
              } else if (check.hint) {
                console.log(`\n    ${check.hint}\n`);
              }
            } else if (mode === "token") {
              if (authEnvVar) {
                const tokenValue = await ask(
                  rl,
                  `    Paste ${authEnvVar} (or Enter to skip): `,
                );
                if (tokenValue) {
                  await saveApiKeyToEnv(authEnvVar, tokenValue);
                  process.env[authEnvVar] = tokenValue;
                  console.log(`    Saved ${authEnvVar} to ${getEnvFile()}\n`);
                }
              } else {
                console.log("    No API key fallback for this skill.\n");
              }
            } else if (mode !== "s" && mode !== "skip") {
              if (authCommand) {
                console.log(
                  "\n    Starting login flow. Follow prompts in terminal/browser...\n",
                );
                await runInteractiveShellCommand(authCommand);
              } else if (check.hint) {
                console.log(`\n    ${check.hint}\n`);
              }
            }

            const ok = await recheckCheck(skill, check.id);
            if (ok) {
              console.log(`    ${check.label}: OK\n`);
              break;
            }
          }

          if (check.hint) {
            const shouldRetry = await promptRetryOrSkip(
              rl,
              check.hint,
            );
            if (shouldRetry) {
              const ok = await recheckCheck(skill, check.id);
              if (ok) {
                console.log(`    ${check.label}: OK\n`);
              } else {
                console.log(
                  `    Still not authenticated. You can set it up later.\n`,
                );
              }
            }
          } else {
            console.log("    Skipped.\n");
          }
          break;
        }

        case "manual":
        default: {
          console.log(`    ${check.label}: ${check.hint || check.message || "manual setup required"}`);
          console.log();
          break;
        }
      }
    }
  }

  rl.close();
}

// ────────────────────────────────────────────────────────────
// Onboarding wizard orchestrator
// ────────────────────────────────────────────────────────────

/**
 * Run the full interactive onboarding wizard:
 *   Step 1: LLM API key prompt
 *   Step 2: Skill picker with live health status
 *   Step 3: Setup selected skills with unmet requirements
 *   Step 4: Final health report
 *
 * Returns the list of selected skill IDs (to be saved by the caller).
 */
export async function runOnboardingWizard(): Promise<string[]> {
  // Step 1: LLM API key
  await runLlmKeyPrompt();

  // Step 2: Skill picker
  const { getSkillHealthReport } = await import("../skills/health");
  const initialReport = await getSkillHealthReport();

  const { selectedIds, report: latestReport } = await runSkillPicker(
    initialReport,
    getSkillHealthReport,
  );

  if (selectedIds.length === 0) {
    console.log("  No skills selected.\n");
    return [];
  }

  console.log(
    `  Selected ${selectedIds.length} skill(s): ${selectedIds.join(", ")}`,
  );

  // Step 3: Setup skills that need it
  await runSkillSetup(selectedIds, latestReport);

  // Step 4: Final health report
  console.log("  Running final health check...");
  const finalReport = await getSkillHealthReport();
  const selectedFinal = finalReport.skills.filter((s) =>
    selectedIds.includes(s.id),
  );
  const ready = selectedFinal.filter((s) => s.status === "AVAILABLE").length;
  const total = selectedFinal.length;

  console.log(`\n  ${ready}/${total} selected skills ready.\n`);

  return selectedIds;
}

/**
 * Ensure selected skills are ready right now.
 * Used by chat-first flows (e.g. `openviber start --skills cursor-agent`).
 */
export async function ensureSkillsReady(selectedIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(selectedIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const { checkSkillsHealth } = await import("../skills/health");
  const report = await checkSkillsHealth(
    uniqueIds.map((id) => ({ id, name: id })),
  );
  await runSkillSetup(uniqueIds, report);
}

// ────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
