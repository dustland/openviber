/**
 * Gemini CLI Credential Sync
 *
 * Writes OAuth tokens (from Supabase-stored web OAuth connections) into
 * the Gemini CLI's credential files (~/.gemini/) so that spinning up
 * `gemini` as a subprocess automatically picks up the user's auth.
 *
 * File formats are based on Gemini CLI's actual storage structure:
 *   - oauth_creds.json   → access/refresh tokens
 *   - settings.json      → auth type selection
 *   - google_accounts.json → active Google account email
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const GEMINI_DIR = path.join(os.homedir(), ".gemini");

export interface GeminiCredentials {
  accessToken: string;
  refreshToken?: string | null;
  accountEmail?: string | null;
  /** Token expiry as epoch-ms. Defaults to 1 hour from now if omitted. */
  expiryDate?: number;
}

/**
 * Write OAuth tokens to ~/.gemini/ in the format the Gemini CLI expects.
 *
 * This enables the Gemini CLI subprocess to authenticate using web-stored
 * Google OAuth tokens (pulled from Supabase) rather than requiring the
 * user to run `gemini` login on each daemon node.
 */
export function syncGeminiCredentials(creds: GeminiCredentials): void {
  fs.mkdirSync(GEMINI_DIR, { recursive: true });

  // ── oauth_creds.json ──
  const oauthCreds: Record<string, unknown> = {
    access_token: creds.accessToken,
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ].join(" "),
    token_type: "Bearer",
    expiry_date: creds.expiryDate ?? Date.now() + 3600 * 1000,
  };
  if (creds.refreshToken) {
    oauthCreds.refresh_token = creds.refreshToken;
  }
  fs.writeFileSync(
    path.join(GEMINI_DIR, "oauth_creds.json"),
    JSON.stringify(oauthCreds, null, 2) + "\n",
    { mode: 0o600 },
  );

  // ── settings.json ──
  // Preserve existing settings, only ensure auth type is set
  const settingsPath = path.join(GEMINI_DIR, "settings.json");
  let settings: Record<string, any> = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    // No existing settings — start fresh
  }
  if (!settings.security) settings.security = {};
  if (!settings.security.auth) settings.security.auth = {};
  settings.security.auth.selectedType = "oauth-personal";
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(settings, null, 2) + "\n",
  );

  // ── google_accounts.json ──
  if (creds.accountEmail) {
    const accountsPath = path.join(GEMINI_DIR, "google_accounts.json");
    const accounts = {
      active: creds.accountEmail,
      old: [],
    };
    fs.writeFileSync(
      accountsPath,
      JSON.stringify(accounts, null, 2) + "\n",
    );
  }
}

/**
 * Check whether Gemini CLI credentials exist on disk (regardless of source).
 */
export function hasGeminiCredentials(): boolean {
  try {
    const credsPath = path.join(GEMINI_DIR, "oauth_creds.json");
    const content = fs.readFileSync(credsPath, "utf8");
    const creds = JSON.parse(content);
    return !!creds.access_token;
  } catch {
    return false;
  }
}
