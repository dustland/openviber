/**
 * OAuth Connection Management
 *
 * Handles storing, retrieving, and refreshing OAuth tokens for external
 * providers (Google, Microsoft, etc.). Tokens are encrypted at rest using
 * the same AES-256-GCM pattern as environment secrets.
 */

import { env } from "$env/dynamic/private";
import { encryptSecretValue, decryptSecretValue } from "./environments";
import { supabaseRequest } from "./supabase";

// ==================== Config ====================

const GOOGLE_CLIENT_ID = () => env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = () => env.GOOGLE_CLIENT_SECRET || "";
const APP_URL = () => env.APP_URL || "http://localhost:6006";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Default Gmail scopes requested during OAuth */
export const GOOGLE_GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

// ==================== Types ====================

export interface OAuthConnectionRow {
  id: string;
  user_id: string;
  provider: string;
  account_email: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface OAuthConnection {
  id: string;
  userId: string;
  provider: string;
  accountEmail: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
}

export interface OAuthConnectionSummary {
  id: string;
  provider: string;
  accountEmail: string | null;
  scopes: string[];
  connected: boolean;
  tokenExpiresAt: string | null;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// ==================== Google OAuth Helpers ====================

/**
 * Check if Google OAuth is configured for this deployment.
 */
export function googleOAuthConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID() && GOOGLE_CLIENT_SECRET());
}

/**
 * Build the Google OAuth consent URL.
 */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID(),
    redirect_uri: `${APP_URL()}/auth/google/callback`,
    response_type: "code",
    scope: GOOGLE_GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID(),
      client_secret: GOOGLE_CLIENT_SECRET(),
      redirect_uri: `${APP_URL()}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

/**
 * Fetch the authenticated user's email from Google.
 */
export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google user info (${response.status})`);
  }

  const data = (await response.json()) as { email?: string };
  if (!data.email) {
    throw new Error("Google user info missing email");
  }
  return data.email;
}

/**
 * Refresh a Google access token using the refresh token.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID(),
      client_secret: GOOGLE_CLIENT_SECRET(),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token refresh failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Revoke a Google token (access or refresh).
 */
async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Best-effort revocation — don't throw
  }
}

// ==================== DB Operations ====================

function rowToConnection(row: OAuthConnectionRow): OAuthConnection {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    accountEmail: row.account_email,
    accessToken: decryptSecretValue(row.access_token_encrypted),
    refreshToken: row.refresh_token_encrypted
      ? decryptSecretValue(row.refresh_token_encrypted)
      : null,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
    scopes: row.scopes || [],
  };
}

function rowToSummary(row: OAuthConnectionRow): OAuthConnectionSummary {
  return {
    id: row.id,
    provider: row.provider,
    accountEmail: row.account_email,
    scopes: row.scopes || [],
    connected: true,
    tokenExpiresAt: row.token_expires_at,
  };
}

/**
 * Get all OAuth connections for a user (summaries — no tokens).
 */
export async function listOAuthConnections(userId: string): Promise<OAuthConnectionSummary[]> {
  const rows = await supabaseRequest<OAuthConnectionRow[]>("oauth_connections", {
    params: { user_id: `eq.${userId}`, order: "provider.asc" },
  });
  return rows.map(rowToSummary);
}

/**
 * Get a specific OAuth connection with decrypted tokens.
 */
export async function getOAuthConnection(
  userId: string,
  provider: string,
): Promise<OAuthConnection | null> {
  const rows = await supabaseRequest<OAuthConnectionRow[]>("oauth_connections", {
    params: {
      user_id: `eq.${userId}`,
      provider: `eq.${provider}`,
      limit: "1",
    },
  });
  if (!rows.length) return null;
  return rowToConnection(rows[0]);
}

/**
 * Get a connection and refresh the token if needed.
 */
export async function getOAuthConnectionFresh(
  userId: string,
  provider: string,
): Promise<OAuthConnection | null> {
  const conn = await getOAuthConnection(userId, provider);
  if (!conn) return null;

  // Check if the token is still valid (with 5-minute buffer)
  if (conn.tokenExpiresAt) {
    const expiresAt = conn.tokenExpiresAt.getTime();
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000;

    if (now + bufferMs >= expiresAt && conn.refreshToken) {
      // Token is expired or about to expire — refresh
      try {
        const refreshed = await refreshGoogleAccessToken(conn.refreshToken);
        const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

        // Update in DB
        await supabaseRequest("oauth_connections", {
          method: "PATCH",
          params: { id: `eq.${conn.id}` },
          body: {
            access_token_encrypted: encryptSecretValue(refreshed.accessToken),
            token_expires_at: newExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
        });

        conn.accessToken = refreshed.accessToken;
        conn.tokenExpiresAt = newExpiresAt;
      } catch (err) {
        console.error("[OAuth] Failed to refresh Google token:", err);
        // Return existing connection — caller can handle stale token
      }
    }
  }

  return conn;
}

/**
 * Upsert an OAuth connection (encrypt tokens before storing).
 */
export async function upsertOAuthConnection(
  userId: string,
  provider: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scopes: string[];
    accountEmail: string;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  const body = {
    user_id: userId,
    provider,
    account_email: tokens.accountEmail,
    access_token_encrypted: encryptSecretValue(tokens.accessToken),
    refresh_token_encrypted: tokens.refreshToken
      ? encryptSecretValue(tokens.refreshToken)
      : null,
    token_expires_at: expiresAt.toISOString(),
    scopes: tokens.scopes,
    updated_at: new Date().toISOString(),
  };

  // Try to find existing connection
  const existing = await supabaseRequest<OAuthConnectionRow[]>("oauth_connections", {
    params: {
      user_id: `eq.${userId}`,
      provider: `eq.${provider}`,
      limit: "1",
    },
  });

  if (existing.length > 0) {
    await supabaseRequest("oauth_connections", {
      method: "PATCH",
      params: { id: `eq.${existing[0].id}` },
      body,
    });
  } else {
    await supabaseRequest("oauth_connections", {
      method: "POST",
      body,
      prefer: "return=minimal",
    });
  }
}

/**
 * Delete an OAuth connection and revoke the token.
 */
export async function deleteOAuthConnection(userId: string, provider: string): Promise<boolean> {
  // Fetch tokens to revoke
  const conn = await getOAuthConnection(userId, provider);
  if (!conn) return false;

  // Revoke tokens
  if (conn.refreshToken) {
    await revokeGoogleToken(conn.refreshToken);
  } else {
    await revokeGoogleToken(conn.accessToken);
  }

  // Delete from DB
  await supabaseRequest("oauth_connections", {
    method: "DELETE",
    params: {
      user_id: `eq.${userId}`,
      provider: `eq.${provider}`,
    },
  });

  return true;
}

/**
 * Get all OAuth connections for a user with decrypted tokens.
 * Used by the daemon config endpoint to pass tokens to nodes.
 */
export async function getDecryptedOAuthConnections(
  userId: string,
): Promise<Array<{ provider: string; accountEmail: string | null; accessToken: string; refreshToken: string | null }>> {
  const rows = await supabaseRequest<OAuthConnectionRow[]>("oauth_connections", {
    params: { user_id: `eq.${userId}` },
  });

  return rows.map((row) => ({
    provider: row.provider,
    accountEmail: row.account_email,
    accessToken: decryptSecretValue(row.access_token_encrypted),
    refreshToken: row.refresh_token_encrypted
      ? decryptSecretValue(row.refresh_token_encrypted)
      : null,
  }));
}
