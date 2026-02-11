import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import {
  createViberNode,
  listViberNodes,
  deleteViberNode,
  ensureDevNode,
} from "$lib/server/viber-nodes";
import { gatewayClient } from "$lib/server/gateway-client";
import { upsertSkillsBatch } from "$lib/server/environments";

// GET /api/nodes - List user's viber nodes (with live gateway status)
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // In dev: ensure a pseudo node exists for the local daemon (no onboarding)
    const devNodeId = env.OPENVIBER_DEV_NODE_ID?.trim();
    if (devNodeId) {
      await ensureDevNode(
        locals.user.id,
        devNodeId,
        env.OPENVIBER_DEV_NODE_NAME?.trim() || "Local Dev",
      );
    }

    const [nodes, gatewayData] = await Promise.all([
      listViberNodes(locals.user.id),
      gatewayClient.getNodes(),
    ]);

    // Build a map of connected node IDs from the gateway
    const connectedDaemons = new Map(
      gatewayData.nodes.map((n) => [n.id, n]),
    );

    // Track which daemon IDs are claimed by DB nodes
    const claimedDaemonIds = new Set<string>();

    // Compute status at runtime: if node's daemon is connected, it's active
    // Also attach hub metrics for visualization
    const enrichedNodes = nodes.map((node) => {
      const daemon = node.node_id ? connectedDaemons.get(node.node_id) : undefined;
      const isConnected = !!daemon;
      if (isConnected && node.node_id) claimedDaemonIds.add(node.node_id);
      return {
        ...node,
        status: isConnected
          ? "active" as const
          : node.node_id
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
      };
    });

    // Add gateway-connected daemons that aren't linked to any DB node as virtual nodes
    for (const [daemonId, daemon] of connectedDaemons) {
      if (!claimedDaemonIds.has(daemonId)) {
        enrichedNodes.push({
          id: daemonId,
          user_id: locals.user.id,
          name: daemon.name || daemonId,
          node_id: daemonId,
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
        });
      }
    }

    // Backfill: sync node-reported skills into the account-level skills table
    // so that pre-existing skills are registered even if never imported via the skill hub.
    try {
      const allNodeSkills = gatewayData.nodes.flatMap((n) =>
        (n.skills ?? []).map((s: { id?: string; name: string; description?: string }) => ({
          skill_id: s.id || s.name,
          name: s.name,
          description: s.description || "",
          source: "node" as const,
        })),
      );
      if (allNodeSkills.length > 0) {
        // Deduplicate by skill_id before upserting
        const seen = new Set<string>();
        const unique = allNodeSkills.filter((s) => {
          if (seen.has(s.skill_id)) return false;
          seen.add(s.skill_id);
          return true;
        });
        void upsertSkillsBatch(locals.user.id, unique);
      }
    } catch (syncError) {
      // Non-fatal: node listing succeeded, skill sync is best-effort
      console.warn("[Nodes API] Failed to sync node skills to account:", syncError);
    }

    return json({ nodes: enrichedNodes });
  } catch (error) {
    console.error("Failed to list viber nodes:", error);
    return json({ error: "Failed to list nodes" }, { status: 500 });
  }
};

// POST /api/nodes - Create a new viber node
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = body.name?.trim() || "My Node";
    const node = await createViberNode(locals.user.id, name);
    return json({ node }, { status: 201 });
  } catch (error) {
    console.error("Failed to create viber node:", error);
    return json({ error: "Failed to create node" }, { status: 500 });
  }
};

// DELETE /api/nodes - Delete a viber node (by id in body)
export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const nodeId = body.id;
    if (!nodeId) {
      return json({ error: "Missing node id" }, { status: 400 });
    }
    const ok = await deleteViberNode(locals.user.id, nodeId);
    if (!ok) {
      return json({ error: "Node not found" }, { status: 404 });
    }
    return json({ ok: true });
  } catch (error) {
    console.error("Failed to delete viber node:", error);
    return json({ error: "Failed to delete node" }, { status: 500 });
  }
};
