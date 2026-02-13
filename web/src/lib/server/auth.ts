import { randomBytes } from "crypto";
import { redirect, type Cookies, type RequestEvent } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const SESSION_TTL_DAYS = 30;
const OAUTH_STATE_COOKIE = "openviber_oauth_state";
const ACCESS_TOKEN_COOKIE = "openviber_sb_access_token";
const REFRESH_TOKEN_COOKIE = "openviber_sb_refresh_token";
const GITHUB_TOKEN_COOKIE = "openviber_gh_token";

const APP_URL = env.APP_URL || "http://localhost:5173";
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * E2E test mode — set E2E_TEST_MODE=true in .env to enable.
 *
 * When active, unauthenticated requests to protected routes receive a synthetic
 * test user instead of being redirected to the OAuth flow. This allows AI agents
 * (Cursor, Codex, Playwright scripts, etc.) to exercise the full UI without
 * needing real GitHub credentials.
 *
 * Safety: the flag is ignored when NODE_ENV === "production".
 */
const E2E_TEST_MODE =
  env.E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production";

/** Synthetic user returned in E2E test mode when no real session exists. */
const E2E_TEST_USER: AuthUser = {
  id: "00000000-0000-4000-a000-000000000000",
  email: "e2e-test@openviber.local",
  name: "E2E Test User",
  avatarUrl: null,
  githubToken: null,
};

/**
 * Returns true when E2E test mode is active.
 */
export function isE2ETestMode(): boolean {
  return E2E_TEST_MODE;
}

/**
 * Returns the synthetic test user (for use in hooks / test-session endpoint).
 */
export function getE2ETestUser(): AuthUser {
  return { ...E2E_TEST_USER };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  githubToken: string | null;
}

export interface SupabaseOAuthProfile {
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface SupabaseRefreshResponse {
  access_token?: string;
  refresh_token?: string;
}

function requireSupabaseAuthConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase auth is not configured.");
  }

  return {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  };
}

/**
 * Returns true when Supabase OAuth is configured for this deployment.
 */
export function supabaseAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Builds a Supabase-managed GitHub OAuth URL and returns state for CSRF validation.
 */
export function getSupabaseGitHubAuthUrl(nextPath = "/") {
  const { supabaseUrl } = requireSupabaseAuthConfig();
  const state = randomBytes(24).toString("hex");

  const callbackUrl = new URL(`${APP_URL}/auth/github/callback`);
  callbackUrl.searchParams.set("next", nextPath);
  callbackUrl.searchParams.set("state", state);

  const authUrl = new URL("/auth/v1/authorize", supabaseUrl);
  authUrl.searchParams.set("provider", "github");
  authUrl.searchParams.set("redirect_to", callbackUrl.toString());
  authUrl.searchParams.set("scopes", "repo,read:user,user:email");

  return { url: authUrl.toString(), state };
}

/**
 * Reads the Supabase user profile using a Supabase-issued access token.
 */
export async function fetchSupabaseProfile(accessToken: string): Promise<SupabaseOAuthProfile> {
  const { supabaseUrl, supabaseAnonKey } = requireSupabaseAuthConfig();
  const response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Supabase profile.");
  }

  const profile = (await response.json()) as {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
      avatar_url?: string;
      picture?: string;
    };
  };

  const email = profile.email?.trim();
  if (!email) {
    throw new Error("Supabase profile is missing an email.");
  }

  const name =
    profile.user_metadata?.full_name?.trim() ||
    profile.user_metadata?.name?.trim() ||
    email.split("@")[0];

  const avatarUrl =
    profile.user_metadata?.avatar_url?.trim() ||
    profile.user_metadata?.picture?.trim() ||
    null;

  return {
    providerId: profile.id,
    email,
    name,
    avatarUrl,
  };
}

/**
 * Refreshes a Supabase session using a refresh token.
 */
export async function refreshSupabaseSession(refreshToken: string) {
  const { supabaseUrl, supabaseAnonKey } = requireSupabaseAuthConfig();
  const response = await fetch(new URL("/auth/v1/token?grant_type=refresh_token", supabaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Supabase session.");
  }

  const payload = (await response.json()) as SupabaseRefreshResponse;
  const nextAccessToken = payload.access_token?.trim();
  const nextRefreshToken = payload.refresh_token?.trim() || refreshToken;

  if (!nextAccessToken) {
    throw new Error("Supabase refresh response is missing access token.");
  }

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  };
}

/**
 * Upserts user profile data into Supabase table `user_profiles`.
 */
export async function upsertSupabaseUserProfile(profile: SupabaseOAuthProfile) {
  const { supabaseUrl } = requireSupabaseAuthConfig();
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const endpoint = new URL("/rest/v1/user_profiles", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "auth_user_id");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([
      {
        auth_user_id: profile.providerId,
        email: profile.email,
        name: profile.name,
        avatar_url: profile.avatarUrl,
      },
    ]),
  });

  if (!response.ok) {
    throw new Error("Failed to upsert user profile into Supabase table.");
  }
}

export function setOAuthStateCookie(state: string, cookies: Cookies, secure: boolean) {
  cookies.set(OAUTH_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 60 * 10,
  });
}

export function readOAuthStateCookie(cookies: Cookies) {
  return cookies.get(OAUTH_STATE_COOKIE);
}

export function clearOAuthStateCookie(cookies: Cookies) {
  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" });
}

/**
 * Creates the application session by persisting Supabase session tokens in httpOnly cookies.
 * Optionally stores the GitHub provider token for API access.
 */
export async function createSession(
  accessToken: string,
  refreshToken: string,
  cookies: Cookies,
  providerToken?: string,
) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: APP_URL.startsWith("https://"),
    expires: expiresAt,
  } as const;

  cookies.set(ACCESS_TOKEN_COOKIE, accessToken, cookieOptions);
  cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, cookieOptions);
  if (providerToken) {
    cookies.set(GITHUB_TOKEN_COOKIE, providerToken, cookieOptions);
  }
}

export async function deleteSession(cookies: Cookies) {
  cookies.delete(ACCESS_TOKEN_COOKIE, { path: "/" });
  cookies.delete(REFRESH_TOKEN_COOKIE, { path: "/" });
  cookies.delete(GITHUB_TOKEN_COOKIE, { path: "/" });
}

export async function getAuthUser(cookies: Cookies): Promise<AuthUser | null> {
  const accessToken = cookies.get(ACCESS_TOKEN_COOKIE);
  const refreshToken = cookies.get(REFRESH_TOKEN_COOKIE);
  const githubToken = cookies.get(GITHUB_TOKEN_COOKIE) || null;

  if (!accessToken && !refreshToken) {
    return null;
  }

  if (accessToken) {
    try {
      const profile = await fetchSupabaseProfile(accessToken);
      return {
        id: profile.providerId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        githubToken,
      };
    } catch {
      // Access tokens are short-lived; fall back to refresh-token exchange.
    }
  }

  if (!refreshToken) {
    await deleteSession(cookies);
    return null;
  }

  try {
    const refreshed = await refreshSupabaseSession(refreshToken);
    await createSession(refreshed.accessToken, refreshed.refreshToken, cookies);
    const profile = await fetchSupabaseProfile(refreshed.accessToken);
    return {
      id: profile.providerId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      githubToken,
    };
  } catch {
    // Do not clear cookies on refresh failure to avoid clobbering a concurrent successful refresh response.
    return null;
  }
}

export function requireAuth(event: RequestEvent): asserts event is RequestEvent & { locals: { user: AuthUser } } {
  if (!event.locals.user) {
    throw redirect(303, "/login");
  }
}
