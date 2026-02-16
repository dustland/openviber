/**
 * Vibers - Server-side helpers for managing vibers table in Supabase
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

export interface Viber {
    id: string;
    user_id: string;
    name: string;
    viber_id: string | null;
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
 * Create a new viber with a one-time onboard token.
 */
export async function createViber(
    userId: string,
    name: string,
    opts?: { viber_id?: string; config?: Record<string, unknown> },
): Promise<Viber> {
    const onboardToken = generateToken();
    const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
    const authToken = generateToken(); // persistent token for daemon reconnection

    const url = restUrl("vibers");
    url.searchParams.set("select", "*");

    const row: Record<string, unknown> = {
        user_id: userId,
        name: name || "My Viber",
        onboard_token: onboardToken,
        token_expires_at: tokenExpiresAt,
        auth_token: authToken,
        config: opts?.config ?? {
            provider: "openrouter",
            model: "anthropic/claude-sonnet-4-20250514",
            tools: ["file", "terminal", "browser"],
            skills: [],
        },
    };
    if (opts?.viber_id) {
        row.viber_id = opts.viber_id;
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            ...serviceHeaders(),
            Prefer: "return=representation",
        },
        body: JSON.stringify([row]),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create viber: ${text}`);
    }

    const rows = await response.json();
    return rows[0] as Viber;
}

/**
 * List all vibers for a user.
 */
export async function listVibers(userId: string): Promise<Viber[]> {
    const url = restUrl("vibers", {
        user_id: `eq.${userId}`,
        select: "*",
        order: "created_at.desc",
    });

    const response = await fetch(url, {
        headers: serviceHeaders(),
    });

    if (!response.ok) {
        throw new Error("Failed to list vibers.");
    }

    return (await response.json()) as Viber[];
}

/**
 * Get a viber by user and daemon viber_id.
 */
export async function getViberByDaemonId(
    userId: string,
    viberId: string,
): Promise<Viber | null> {
    const url = restUrl("vibers", {
        user_id: `eq.${userId}`,
        viber_id: `eq.${viberId}`,
        select: "*",
    });

    const response = await fetch(url, { headers: serviceHeaders() });
    if (!response.ok) return null;

    const rows = (await response.json()) as Viber[];
    return rows[0] ?? null;
}

const DEFAULT_DEV_VIBER_CONFIG = {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4-20250514",
    tools: ["file", "terminal", "browser"],
    skills: [],
};

/**
 * Ensure the current user has a vibers row for the dev pseudo viber.
 * When OPENVIBER_DEV_VIBER_ID is set (e.g. in .env), the local daemon that
 * connects with that id (X-Viber-Id header) will be matched to this row
 * and shown as a normal viber. Call from GET /api/vibers when env is set.
 */
export async function ensureDevViber(
    userId: string,
    devViberId: string,
    name = "Local Dev",
): Promise<Viber> {
    const existing = await getViberByDaemonId(userId, devViberId);
    if (existing) return existing;

    const url = restUrl("vibers");
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
                viber_id: devViberId,
                onboard_token: null,
                token_expires_at: null,
                auth_token: null,
                config: DEFAULT_DEV_VIBER_CONFIG,
            },
        ]),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create dev pseudo viber: ${text}`);
    }

    const rows = (await response.json()) as Viber[];
    return rows[0] as Viber;
}

/**
 * Get a viber by ID (for the given user).
 */
export async function getViber(userId: string, viberId: string): Promise<Viber | null> {
    const url = restUrl("vibers", {
        id: `eq.${viberId}`,
        user_id: `eq.${userId}`,
        select: "*",
    });

    const response = await fetch(url, {
        headers: serviceHeaders(),
    });

    if (!response.ok) return null;

    const rows = (await response.json()) as Viber[];
    return rows[0] ?? null;
}

/**
 * Get a viber by either its primary key (UUID) or its gateway viber_id.
 * Does NOT filter by user_id — intended for E2E/admin use only.
 */
export async function getViberByAnyId(viberId: string): Promise<Viber | null> {
    const url = restUrl("vibers", {
        or: `(id.eq.${viberId},viber_id.eq.${viberId})`,
        select: "*",
    });

    const response = await fetch(url, {
        headers: serviceHeaders(),
    });

    if (!response.ok) return null;

    const rows = (await response.json()) as Viber[];
    return rows[0] ?? null;
}

/**
 * Get the first viber row in the DB (any user).
 * Used by E2E mode to find a viber to adopt for config persistence.
 */
export async function getFirstViber(): Promise<Viber | null> {
    const url = restUrl("vibers", {
        select: "*",
        limit: "1",
        order: "created_at.asc",
    });

    const response = await fetch(url, {
        headers: serviceHeaders(),
    });

    if (!response.ok) return null;

    const rows = (await response.json()) as Viber[];
    return rows[0] ?? null;
}

/**
 * Claim a viber by its onboard token (called by CLI).
 * Returns the viber with all config needed for the daemon. Consumes the token.
 */
export async function claimViberByToken(onboardToken: string): Promise<Viber | null> {
    // 1. Find the viber by token
    const findUrl = restUrl("vibers", {
        onboard_token: `eq.${onboardToken}`,
        select: "*",
    });

    const findResponse = await fetch(findUrl, { headers: serviceHeaders() });
    if (!findResponse.ok) return null;

    const rows = (await findResponse.json()) as Viber[];
    const viber = rows[0];
    if (!viber) return null;

    // 2. Check token expiry
    if (viber.token_expires_at && new Date(viber.token_expires_at) < new Date()) {
        return null; // Token expired
    }

    // 3. Consume the token — set onboard_token to null, status to active
    const updateUrl = restUrl("vibers", {
        id: `eq.${viber.id}`,
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

    const updated = (await updateResponse.json()) as Viber[];
    return updated[0] ?? null;
}

/**
 * Update a viber's config.
 * Accepts either the DB primary key (UUID) or the gateway viber_id.
 */
export async function updateViberConfig(
    viberId: string,
    config: Record<string, unknown>,
): Promise<Viber | null> {
    const url = restUrl("vibers", {
        or: `(id.eq.${viberId},viber_id.eq.${viberId})`,
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

    const rows = (await response.json()) as Viber[];
    return rows[0] ?? null;
}

/**
 * Get a viber by its auth_token (for daemon config pull).
 */
export async function getViberByAuthToken(authToken: string): Promise<Viber | null> {
    const url = restUrl("vibers", {
        auth_token: `eq.${authToken}`,
        select: "*",
    });

    const response = await fetch(url, { headers: serviceHeaders() });
    if (!response.ok) return null;

    const json = (await response.json()) as Viber[];

    // Update last_seen_at for this viber
    if (json.length > 0) {
        const viber = json[0];
        const updateUrl = restUrl("vibers", {
            id: `eq.${viber.id}`,
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
 * Delete a viber.
 */
export async function deleteViber(userId: string, viberId: string): Promise<boolean> {
    const url = restUrl("vibers", {
        id: `eq.${viberId}`,
        user_id: `eq.${userId}`,
    });

    const response = await fetch(url, {
        method: "DELETE",
        headers: serviceHeaders(),
    });

    return response.ok;
}

/**
 * Update a viber's name.
 */
export async function updateViberName(
    viberId: string,
    name: string,
): Promise<Viber | null> {
    const url = restUrl("vibers", {
        id: `eq.${viberId}`,
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

    const rows = (await response.json()) as Viber[];
    return rows[0] ?? null;
}

/**
 * Update a viber's config sync state.
 */
export async function updateConfigSyncState(
    viberId: string,
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
): Promise<Viber | null> {
    const url = restUrl("vibers", {
        id: `eq.${viberId}`,
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

    const rows = (await response.json()) as Viber[];
    return rows[0] ?? null;
}
