import { json, type RequestHandler } from "@sveltejs/kit";
import {
  clearOAuthStateCookie,
  createSession,
  fetchSupabaseProfile,
  readOAuthStateCookie,
  upsertSupabaseUserProfile,
} from "$lib/server/auth";

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const body = (await request.json()) as {
      accessToken?: string;
      refreshToken?: string;
      providerToken?: string;
      state?: string;
    };

    if (!body.accessToken || !body.refreshToken || !body.state) {
      return json({ error: "Missing access token, refresh token, or state." }, { status: 400 });
    }

    const cookieState = readOAuthStateCookie(cookies);
    clearOAuthStateCookie(cookies);

    if (!cookieState || cookieState !== body.state) {
      return json({ error: "Invalid OAuth state." }, { status: 400 });
    }

    const profile = await fetchSupabaseProfile(body.accessToken);
    await upsertSupabaseUserProfile(profile);
    await createSession(body.accessToken, body.refreshToken, cookies, body.providerToken);

    return json({ ok: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Failed to create session.";
    return json({ error: message }, { status: 500 });
  }
};
