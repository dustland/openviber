import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSettingsForUser } from "$lib/server/settings";
import { supabaseRequest } from "$lib/server/supabase";

/**
 * GET /api/onboarding
 *
 * Returns whether the current user has completed global onboarding.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettingsForUser(locals.user.id);

  return json({
    completed: !!settings.onboardingCompletedAt,
    completedAt: settings.onboardingCompletedAt,
    hasChatModel: !!settings.chatModel,
    hasTimezone: !!settings.timezone,
  });
};

/**
 * POST /api/onboarding
 *
 * Saves onboarding choices (model + timezone) and marks onboarding as complete.
 * AI is powered by a built-in OpenRouter key — users can add their own
 * provider keys later via Settings > General.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { chatModel, timezone } = body as {
      chatModel?: string;
      timezone?: string;
    };

    const userId = locals.user.id;
    const now = new Date().toISOString();

    // Upsert user_settings
    const existing = await supabaseRequest<{ id: string }[]>("user_settings", {
      params: { select: "id", user_id: `eq.${userId}` },
    });
    const row = Array.isArray(existing) ? existing[0] : null;

    const settingsData = {
      chat_model: chatModel || null,
      timezone: timezone || null,
      onboarding_completed_at: now,
      updated_at: now,
    };

    if (row) {
      await supabaseRequest("user_settings", {
        method: "PATCH",
        params: { user_id: `eq.${userId}` },
        body: settingsData,
      });
    } else {
      await supabaseRequest("user_settings", {
        method: "POST",
        prefer: "return=minimal",
        body: {
          user_id: userId,
          ...settingsData,
        },
      });
    }

    return json({ ok: true, completedAt: now });
  } catch (err: any) {
    console.error("[Onboarding API] Failed:", err);
    return json({ error: err?.message || "Onboarding failed" }, { status: 500 });
  }
};
