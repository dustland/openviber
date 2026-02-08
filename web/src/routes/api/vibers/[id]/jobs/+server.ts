import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listJobsForViber } from "$lib/server/jobs";

export const GET: RequestHandler = async ({ params }) => {
  try {
    const jobs = await listJobsForViber(params.id);
    return json({
      jobs,
      count: jobs.length,
      jobsWithDescriptions: jobs,
    });
  } catch (err) {
    console.error("[Jobs API] Error listing jobs:", err);
    return json({ error: "Failed to list jobs" }, { status: 500 });
  }
};
