import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { hubClient } from "$lib/server/hub-client";

// GET /api/tasks - List all tasks from hub (optional ?viberId= to filter)
export const GET: RequestHandler = async ({ url }) => {
  try {
    const { tasks } = await hubClient.getTasks();
    const viberId = url.searchParams.get("viberId");
    const filtered = viberId
      ? tasks.filter((t) => t.viberId === viberId)
      : tasks;
    return json({ tasks: filtered });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
};
