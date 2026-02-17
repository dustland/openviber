import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { queryLogs } from "$lib/server/logs";
import { gatewayClient, type GatewayEvent } from "$lib/server/gateway";

/**
 * GET /api/logs - Fetch logs from Supabase (history) + board server (live events), merged.
 *
 * Query params:
 *   category  - "activity" | "system" (optional)
 *   level     - comma-separated: "info,warn,error" (optional)
 *   limit     - max rows (default 100, max 500)
 *   before    - ISO timestamp cursor for pagination
 *   search    - text filter on message
 *   source    - "all" (default) | "db" | "board"
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = url.searchParams.get("category") as
    | "activity"
    | "system"
    | null;
  const level = url.searchParams.get("level") || undefined;
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "100", 10),
    500,
  );
  const before = url.searchParams.get("before") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const source = url.searchParams.get("source") || "all";

  try {
    // Fetch from both sources in parallel
    const [dbLogs, gatewayResult] = await Promise.all([
      source !== "gateway" && source !== "board" && source !== "hub" // support legacy "hub" source value
        ? queryLogs(locals.user.id, {
          category: category ?? undefined,
          level,
          limit,
          before,
          search,
        })
        : Promise.resolve([]),
      source !== "db"
        ? gatewayClient.getEvents(limit)
        : Promise.resolve({ events: [] as GatewayEvent[] }),
    ]);

    // Normalize board server events into the same shape as DB logs
    const gatewayLogs = gatewayResult.events
      .filter((e) => {
        if (category && e.category !== category) return false;
        if (level) {
          const levels = level.split(",");
          const eventLevel = e.level || inferLevel(e);
          if (!levels.includes(eventLevel)) return false;
        }
        if (search) {
          const msg = e.message || eventMessage(e);
          if (!msg.toLowerCase().includes(search.toLowerCase())) return false;
        }
        if (before && e.at >= before) return false;
        return true;
      })
      .map((e) => ({
        id: `gateway-${e.at}-${e.viberId || e.viberId || "sys"}`,
        user_id: locals.user!.id,
        level: e.level || inferLevel(e),
        category: e.category,
        component: e.component || inferComponent(e),
        message: e.message || eventMessage(e),
        viber_id: e.viberId || null,
        task_id: (e.event?.taskId as string) || null,
        metadata: e.event || e.metadata || null,
        created_at: e.at,
        source: "gateway" as const,
      }));

    // Mark DB logs with source
    const dbLogsWithSource = dbLogs.map((row) => ({
      ...row,
      source: "db" as const,
    }));

    // Merge, deduplicate by preferring DB rows, sort descending
    const seen = new Set(dbLogsWithSource.map((r) => r.id));
    const merged = [
      ...dbLogsWithSource,
      ...gatewayLogs.filter((h) => !seen.has(h.id)),
    ];
    merged.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return json({
      logs: merged.slice(0, limit),
      hasMore: merged.length >= limit,
    });
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return json({ error: "Failed to fetch logs" }, { status: 500 });
  }
};

// ── Helpers to normalize hub events ──────────────────────────────────────────

function inferLevel(e: GatewayEvent): string {
  if (e.event?.kind === "error" || e.viberStatus === "error") return "error";
  if (e.event?.kind === "status" && e.event?.phase === "warning") return "warn";
  return "info";
}

function inferComponent(e: GatewayEvent): string {
  if (e.category === "system") return e.component || "node";
  if (e.event?.kind === "tool-call" || e.event?.kind === "tool-result")
    return "skill";
  return "task";
}

function eventMessage(e: GatewayEvent): string {
  if (e.message) return e.message;
  if (e.category === "system") return `System event from ${e.viberName || e.viberId || "unknown"}`;

  const kind = e.event?.kind as string | undefined;
  switch (kind) {
    case "status":
      return (e.event?.message as string) || `Task status: ${e.event?.phase || "update"}`;
    case "tool-call":
      return `Tool call: ${e.event?.toolName || "unknown"}`;
    case "tool-result":
      return `Tool result: ${e.event?.toolName || "unknown"}`;
    case "text-delta":
      return "Streaming text...";
    case "error": {
      const errMsg = (e.event?.message as string) || (e.event?.error as string) || "unknown";
      const errModel = e.event?.model as string | undefined;
      return errModel ? `Error [${errModel}]: ${errMsg}` : `Error: ${errMsg}`;
    }
    default:
      return `Event: ${kind || "unknown"}`;
  }
}
