/**
 * GET /api/skills/requirements?skillId=gmail
 *
 * Checks whether a user's OAuth connections and env vars satisfy
 * a skill's declared requirements. Returns ready status and unmet items.
 */

import { json, type RequestHandler } from "@sveltejs/kit";
import { listOAuthConnections, googleOAuthConfigured } from "$lib/server/oauth";

// Hard-coded skill requirements (mirrors SKILL.md frontmatter).
// In the future this could be dynamically loaded from the skill registry.
const SKILL_REQUIREMENTS: Record<string, {
  oauth?: Array<{ provider: string; scopes: string[] }>;
  env?: Array<{ name: string; label?: string; hint?: string; optional?: boolean }>;
  bins?: Array<{ name: string; install?: Record<string, string> }>;
}> = {
  gmail: {
    oauth: [
      {
        provider: "google",
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.modify",
        ],
      },
    ],
  },
};

export interface UnmetRequirement {
  type: "oauth" | "env" | "bin";
  label: string;
  hint?: string;
  /** For OAuth: the connect URL */
  connectUrl?: string;
  /** For env: the env var name */
  envName?: string;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const skillId = url.searchParams.get("skillId");
  if (!skillId) {
    return json({ error: "Missing skillId parameter" }, { status: 400 });
  }

  const requirements = SKILL_REQUIREMENTS[skillId];
  if (!requirements) {
    // No requirements declared — skill is ready by default
    return json({ ready: true, unmet: [], skillId });
  }

  const unmet: UnmetRequirement[] = [];

  // Check OAuth requirements
  if (requirements.oauth) {
    const connections = await listOAuthConnections(locals.user.id);

    for (const oauthReq of requirements.oauth) {
      const connection = connections.find(
        (c) => c.provider === oauthReq.provider && c.connected,
      );

      if (!connection) {
        const configured =
          oauthReq.provider === "google" ? googleOAuthConfigured() : false;
        unmet.push({
          type: "oauth",
          label: `Connect ${oauthReq.provider === "google" ? "Google" : oauthReq.provider} account`,
          hint: configured
            ? undefined
            : `Server needs ${oauthReq.provider.toUpperCase()}_CLIENT_ID configured`,
          connectUrl: configured ? `/auth/${oauthReq.provider}` : undefined,
        });
      }
    }
  }

  // Check env requirements (these are server-side env vars)
  if (requirements.env) {
    for (const envReq of requirements.env) {
      if (envReq.optional) continue;
      // We can't check the daemon's env from the web server,
      // so we report these as informational
      unmet.push({
        type: "env",
        label: envReq.label || `Set ${envReq.name}`,
        hint: envReq.hint,
        envName: envReq.name,
      });
    }
  }

  // Check binary requirements (informational only — can't check from web)
  if (requirements.bins) {
    for (const binReq of requirements.bins) {
      unmet.push({
        type: "bin",
        label: `Install ${binReq.name}`,
        hint: binReq.install?.macos || binReq.install?.linux || undefined,
      });
    }
  }

  return json({
    skillId,
    ready: unmet.length === 0,
    unmet,
  });
};
