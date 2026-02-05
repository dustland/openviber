import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db, schema } from "$lib/server/db";
import { eq } from "drizzle-orm";
import { redirect, type Cookies, type RequestEvent } from "@sveltejs/kit";

const SESSION_COOKIE = "openviber_session";
const OAUTH_STATE_COOKIE = "openviber_oauth_state";
const SESSION_TTL_DAYS = 30;

const APP_URL = process.env.APP_URL || "http://localhost:5173";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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

function createSessionToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function constantTimeMatch(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
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

export async function findOrCreateUser(profile: SupabaseOAuthProfile) {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.authUserId, profile.providerId))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0];
    await db
      .update(schema.users)
      .set({
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));
    return { ...user, ...profile };
  }

  const id = `user_${randomBytes(12).toString("hex")}`;
  const now = new Date();
  await db.insert(schema.users).values({
    id,
    authUserId: profile.providerId,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id,
    authUserId: profile.providerId,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createSession(userId: string, cookies: Cookies) {
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(schema.sessions).values({
    id: `session_${randomBytes(12).toString("hex")}`,
    userId,
    tokenHash,
    createdAt: now,
    expiresAt,
  });

  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: APP_URL.startsWith("https://"),
    expires: expiresAt,
  });
}

export async function deleteSession(cookies: Cookies) {
  const token = cookies.get(SESSION_COOKIE);
  if (token) {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, hashToken(token)));
  }

  cookies.delete(SESSION_COOKIE, { path: "/" });
}

export async function getAuthUser(cookies: Cookies): Promise<AuthUser | null> {
  const token = cookies.get(SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      sessionTokenHash: schema.sessions.tokenHash,
      sessionId: schema.sessions.id,
      expiresAt: schema.sessions.expiresAt,
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) {
    cookies.delete(SESSION_COOKIE, { path: "/" });
    return null;
  }

  const row = rows[0];
  if (!constantTimeMatch(row.sessionTokenHash, tokenHash) || row.expiresAt < new Date()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, row.sessionId));
    cookies.delete(SESSION_COOKIE, { path: "/" });
    return null;
  }

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
  };
}

export function requireAuth(event: RequestEvent): asserts event is RequestEvent & { locals: { user: AuthUser } } {
  if (!event.locals.user) {
    throw redirect(303, "/login");
  }
}
