import { randomBytes } from "crypto";
import { redirect, type Cookies, type RequestEvent } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const SESSION_TTL_DAYS = 30;
const OAUTH_STATE_COOKIE = "openviber_oauth_state";
const ACCESS_TOKEN_COOKIE = "openviber_sb_access_token";

const APP_URL = env.APP_URL || "http://localhost:5173";
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface SupabaseOAuthProfile {
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
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
 * Builds a Supabase-managed Google OAuth URL and returns state for CSRF validation.
 */
export function getSupabaseGoogleAuthUrl(nextPath = "/vibers") {
  const { supabaseUrl } = requireSupabaseAuthConfig();
  const state = randomBytes(24).toString("hex");

  const callbackUrl = new URL(`${APP_URL}/auth/google/callback`);
  callbackUrl.searchParams.set("next", nextPath);
  callbackUrl.searchParams.set("state", state);

  const authUrl = new URL("/auth/v1/authorize", supabaseUrl);
  authUrl.searchParams.set("provider", "google");
  authUrl.searchParams.set("redirect_to", callbackUrl.toString());

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
 * Creates the application session by persisting a Supabase access token in an httpOnly cookie.
 */
export async function createSession(accessToken: string, cookies: Cookies) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: APP_URL.startsWith("https://"),
    expires: expiresAt,
  });
}

export async function deleteSession(cookies: Cookies) {
  cookies.delete(ACCESS_TOKEN_COOKIE, { path: "/" });
}

export async function getAuthUser(cookies: Cookies): Promise<AuthUser | null> {
  const accessToken = cookies.get(ACCESS_TOKEN_COOKIE);
  if (!accessToken) return null;

  try {
    const profile = await fetchSupabaseProfile(accessToken);
    return {
      id: profile.providerId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    };
  } catch {
    cookies.delete(ACCESS_TOKEN_COOKIE, { path: "/" });
    return null;
  }
}

export function requireAuth(event: RequestEvent): asserts event is RequestEvent & { locals: { user: AuthUser } } {
  if (!event.locals.user) {
    throw redirect(303, "/login");
  }
}
