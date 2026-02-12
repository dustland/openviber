import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import {
  createViber,
  listVibers,
  deleteViber,
  ensureDevViber,
} from "$lib/server/vibers";
import { gatewayClient } from "$lib/server/gateway";
import { upsertSkillsBatch } from "$lib/server/environments";

// GET /api/vibers - List user's vibers (with live gateway status)
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // In dev: ensure a pseudo viber exists for the local daemon (no onboarding)
    const devViberId = env.OPENVIBER_DEV_VIBER_ID?.trim();
    if (devViberId) {
      await ensureDevViber(
        locals.user.id,
        devViberId,
        env.OPENVIBER_DEV_VIBER_NAME?.trim() || "Local Dev",
      );
    }

    const [vibers, gatewayData] = await Promise.all([
      listVibers(locals.user.id),
      gatewayClient.getNodes(),
    ]);

    // Build a map of connected daemon IDs from the gateway
    const connectedDaemons = new Map(
      gatewayData.nodes.map((n) => [n.id, n]),
    );

    // Track which daemon IDs are claimed by DB vibers
    const claimedDaemonIds = new Set<string>();

    // Compute status at runtime: if viber's daemon is connected, it's active
    // Also attach hub metrics for visualization
    const enrichedVibers = vibers.map((viber) => {
      const daemon = viber.viber_id ? connectedDaemons.get(viber.viber_id) : undefined;
      const isConnected = !!daemon;
      if (isConnected && viber.viber_id) claimedDaemonIds.add(viber.viber_id);
      return {
        ...viber,
        status: isConnected
          ? "active" as const
          : viber.viber_id
            ? "offline" as const
            : "pending" as const,
        // Attach gateway observability metrics
        version: daemon?.version,
        platform: daemon?.platform,
        capabilities: daemon?.capabilities,
        skills: daemon?.skills,
        lastHeartbeat: daemon?.lastHeartbeat,
        runningVibers: daemon?.runningVibers,
        machine: daemon?.machine,
        viber: daemon?.viber,
        // Include config sync state from Supabase
        config_sync_state: viber.config_sync_state,
      };
    });

    // Add gateway-connected daemons that aren't linked to any DB viber as virtual vibers
    for (const [daemonId, daemon] of connectedDaemons) {
      if (!claimedDaemonIds.has(daemonId)) {
        enrichedVibers.push({
          id: daemonId,
          user_id: locals.user.id,
          name: daemon.name || daemonId,
          viber_id: daemonId,
          onboard_token: null,
          token_expires_at: null,
          hub_url: null,
          auth_token: null,
          config: {},
          status: "active" as const,
          last_seen_at: daemon.connectedAt,
          created_at: daemon.connectedAt,
          updated_at: daemon.connectedAt,
          // Attach gateway observability metrics
          version: daemon.version,
          platform: daemon.platform,
          capabilities: daemon.capabilities,
          skills: daemon.skills,
          lastHeartbeat: daemon.lastHeartbeat,
          runningVibers: daemon.runningVibers,
          machine: daemon.machine,
          viber: daemon.viber,
          config_sync_state: undefined,
        });
      }
    }

    // Backfill: sync viber-reported skills into the account-level skills table
    // so that pre-existing skills are registered even if never imported via the skill hub.
    try {
      const allViberSkills = gatewayData.nodes.flatMap((n) =>
        (n.skills ?? []).map((s: { id?: string; name: string; description?: string }) => ({
          skill_id: s.id || s.name,
          name: s.name,
          description: s.description || "",
          source: "node" as const,
        })),
      );
      if (allViberSkills.length > 0) {
        // Deduplicate by skill_id before upserting
        const seen = new Set<string>();
        const unique = allViberSkills.filter((s) => {
          if (seen.has(s.skill_id)) return false;
          seen.add(s.skill_id);
          return true;
        });
        void upsertSkillsBatch(locals.user.id, unique);
      }
    } catch (syncError) {
      // Non-fatal: viber listing succeeded, skill sync is best-effort
      console.warn("[Vibers API] Failed to sync viber skills to account:", syncError);
    }

    return json({ vibers: enrichedVibers });
  } catch (error) {
    console.error("Failed to list vibers:", error);
    return json({ error: "Failed to list vibers" }, { status: 500 });
  }
};

// POST /api/vibers - Create a new viber
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = body.name?.trim() || "My Viber";
    const viber = await createViber(locals.user.id, name);
    return json({ viber }, { status: 201 });
  } catch (error) {
    console.error("Failed to create viber:", error);
    return json({ error: "Failed to create viber" }, { status: 500 });
  }
};

// DELETE /api/vibers - Delete a viber (by id in body)
export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const viberId = body.id;
    if (!viberId) {
      return json({ error: "Missing viber id" }, { status: 400 });
    }
    const ok = await deleteViber(locals.user.id, viberId);
    if (!ok) {
      return json({ error: "Viber not found" }, { status: 404 });
    }
    return json({ ok: true });
  } catch (error) {
    console.error("Failed to delete viber:", error);
    return json({ error: "Failed to delete viber" }, { status: 500 });
  }
};
