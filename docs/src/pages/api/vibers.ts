/**
 * Vibers API Endpoint
 *
 * GET /api/vibers - Returns list of connected vibers
 * POST /api/vibers/task - Submit a task to a viber
 */

import type { APIRoute } from "astro";
import { viberServer } from "../../lib/viber/server";

// GET /api/vibers - List connected vibers
export const GET: APIRoute = async () => {
  const vibers = viberServer.getVibers();

  return new Response(
    JSON.stringify({
      connected: vibers.length > 0,
      vibers: vibers.map((v) => ({
        id: v.id,
        name: v.name,
        platform: v.platform,
        capabilities: v.capabilities,
        connectedAt: v.connectedAt,
      })),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};

// POST /api/vibers - Submit a task
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { goal, viberId } = body;

    if (!goal) {
      return new Response(
        JSON.stringify({ error: "goal is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!viberServer.hasVibers()) {
      return new Response(
        JSON.stringify({ error: "No viber connected" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const taskId = await viberServer.submitTask(goal, { viberId });

    return new Response(
      JSON.stringify({ taskId, status: "submitted" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
