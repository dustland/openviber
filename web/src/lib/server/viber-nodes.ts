/**
 * Viber Nodes - Server-side helpers for managing viber_nodes table in Supabase
 *
 * Uses raw Supabase REST API (consistent with auth.ts pattern).
 */

import { randomBytes } from "crypto";
import { env } from "$env/dynamic/private";

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required).");
  }
  return { supabaseUrl: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY };
}

function serviceHeaders() {
  const { serviceRoleKey } = requireConfig();
  return {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function restUrl(path: string, params?: Record<string, string>) {
  const { supabaseUrl } = requireConfig();
  const url = new URL(`/rest/v1/${path}`, supabaseUrl);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url;
}

export interface ViberNode {
  id: string;
  user_id: string;
  name: string;
  node_id: string | null;
  onboard_token: string | null;
  token_expires_at: string | null;
  hub_url: string | null;
  auth_token: string | null;
  config: Record<string, unknown>;
  config_sync_state?: {
    configVersion?: string;
    lastConfigPullAt?: string;
    validations?: Array<{
      category: string;
      status: string;
      message?: string;
      checkedAt: string;
    }>;
  };
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  status: string;
}

/**
 * Generate a secure random token for onboarding.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Create a new viber node with a one-time onboard token.
 */
export async function createViberNode(userId: string, name: string): Promise<ViberNode> {
  const onboardToken = generateToken();
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
  const authToken = generateToken(); // persistent token for daemon reconnection

  const url = restUrl("viber_nodes");
  url.searchParams.set("select", "*");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify([{
      user_id: userId,
      name: name || "My Node",
      onboard_token: onboardToken,
      token_expires_at: tokenExpiresAt,
      auth_token: authToken,
      config: {
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4-20250514",
        tools: ["file", "terminal", "browser"],
        skills: [],
      },
    }]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create viber node: ${text}`);
  }

  const rows = await response.json();
  return rows[0] as ViberNode;
}

/**
 * List all viber nodes for a user.
 */
export async function listViberNodes(userId: string): Promise<ViberNode[]> {
  const url = restUrl("viber_nodes", {
    user_id: `eq.${userId}`,
    select: "*",
    order: "created_at.desc",
  });

  const response = await fetch(url, {
    headers: serviceHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to list viber nodes.");
  }

  return (await response.json()) as ViberNode[];
}

/**
 * Get a viber node by user and hub node_id (daemon id).
 */
export async function getViberNodeByNodeId(
  userId: string,
  nodeId: string,
): Promise<ViberNode | null> {
  const url = restUrl("viber_nodes", {
    user_id: `eq.${userId}`,
    node_id: `eq.${nodeId}`,
    select: "*",
  });

  const response = await fetch(url, { headers: serviceHeaders() });
  if (!response.ok) return null;

  const rows = (await response.json()) as ViberNode[];
  return rows[0] ?? null;
}

const DEFAULT_DEV_NODE_CONFIG = {
  provider: "openrouter",
  model: "anthropic/claude-sonnet-4-20250514",
  tools: ["file", "terminal", "browser"],
  skills: [],
};

/**
 * Ensure the current user has a viber_nodes row for the dev pseudo node.
 * When OPENVIBER_DEV_NODE_ID is set (e.g. in .env), the local daemon that
 * connects with that id (X-Viber-Id header) will be matched to this row
 * and shown as a normal node. Call from GET /api/vibers when env is set.
 */
export async function ensureDevNode(
  userId: string,
  devNodeId: string,
  name = "Local Dev",
): Promise<ViberNode> {
  const existing = await getViberNodeByNodeId(userId, devNodeId);
  if (existing) return existing;

  const url = restUrl("viber_nodes");
  url.searchParams.set("select", "*");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        user_id: userId,
        name: name.trim() || "Local Dev",
        node_id: devNodeId,
        onboard_token: null,
        token_expires_at: null,
        auth_token: null,
        config: DEFAULT_DEV_NODE_CONFIG,
      },
    ]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create dev pseudo node: ${text}`);
  }

  const rows = (await response.json()) as ViberNode[];
  return rows[0] as ViberNode;
}

/**
 * Get a viber node by ID (for the given user).
 */
export async function getViberNode(userId: string, nodeId: string): Promise<ViberNode | null> {
  const url = restUrl("viber_nodes", {
    id: `eq.${nodeId}`,
    user_id: `eq.${userId}`,
    select: "*",
  });

  const response = await fetch(url, {
    headers: serviceHeaders(),
  });

  if (!response.ok) return null;

  const rows = (await response.json()) as ViberNode[];
  return rows[0] ?? null;
}

/**
 * Claim a viber node by its onboard token (called by CLI).
 * Returns the node with all config needed for the daemon. Consumes the token.
 */
export async function claimNodeByToken(onboardToken: string): Promise<ViberNode | null> {
  // 1. Find the node by token
  const findUrl = restUrl("viber_nodes", {
    onboard_token: `eq.${onboardToken}`,
    select: "*",
  });

  const findResponse = await fetch(findUrl, { headers: serviceHeaders() });
  if (!findResponse.ok) return null;

  const rows = (await findResponse.json()) as ViberNode[];
  const node = rows[0];
  if (!node) return null;

  // 2. Check token expiry
  if (node.token_expires_at && new Date(node.token_expires_at) < new Date()) {
    return null; // Token expired
  }

  // 3. Consume the token — set onboard_token to null, status to active
  const updateUrl = restUrl("viber_nodes", {
    id: `eq.${node.id}`,
    select: "*",
  });

  const updateResponse = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      ...serviceHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      onboard_token: null,
      token_expires_at: null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!updateResponse.ok) return null;

  const updated = (await updateResponse.json()) as ViberNode[];
  return updated[0] ?? null;
}

/**
 * Update a viber node's config.
 */
export async function updateNodeConfig(
  nodeId: string,
  config: Record<string, unknown>,
): Promise<ViberNode | null> {
  const url = restUrl("viber_nodes", {
    id: `eq.${nodeId}`,
    select: "*",
  });

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...serviceHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      config,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) return null;

  const rows = (await response.json()) as ViberNode[];
  return rows[0] ?? null;
}

/**
 * Get a viber node by its auth_token (for daemon config pull).
 */
export async function getNodeByAuthToken(authToken: string): Promise<ViberNode | null> {
  const url = restUrl("viber_nodes", {
    auth_token: `eq.${authToken}`,
    select: "*",
  });

  const response = await fetch(url, { headers: serviceHeaders() });
  if (!response.ok) return null;

  const json = (await response.json()) as ViberNode[];

  // Update last_seen_at for this node
  if (json.length > 0) {
    const node = json[0];
    const updateUrl = restUrl("viber_nodes", {
      id: `eq.${node.id}`,
      select: "*",
    });
    await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        ...serviceHeaders(),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  }

  return json[0] ?? null;
}

/**
 * Delete a viber node.
 */
export async function deleteViberNode(userId: string, nodeId: string): Promise<boolean> {
  const url = restUrl("viber_nodes", {
    id: `eq.${nodeId}`,
    user_id: `eq.${userId}`,
  });

  const response = await fetch(url, {
    method: "DELETE",
    headers: serviceHeaders(),
  });

  return response.ok;
}

/**
 * Update a viber node's name.
 */
export async function updateNodeName(
  nodeId: string,
  name: string,
): Promise<ViberNode | null> {
  const url = restUrl("viber_nodes", {
    id: `eq.${nodeId}`,
    select: "*",
  });

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...serviceHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) return null;

  const rows = (await response.json()) as ViberNode[];
  return rows[0] ?? null;
}

/**
 * Update a viber node's config sync state.
 */
export async function updateConfigSyncState(
  nodeId: string,
  syncState: {
    configVersion?: string;
    lastConfigPullAt?: string;
    validations?: Array<{
      category: string;
      status: string;
      message?: string;
      checkedAt: string;
    }>;
  },
): Promise<ViberNode | null> {
  const url = restUrl("viber_nodes", {
    id: `eq.${nodeId}`,
    select: "*",
  });

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...serviceHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      config_sync_state: syncState,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) return null;

  const rows = (await response.json()) as ViberNode[];
  return rows[0] ?? null;
}
