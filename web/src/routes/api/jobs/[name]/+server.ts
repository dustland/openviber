import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as path from "path";
import * as fs from "fs/promises";
import * as yaml from "yaml";
import { getGlobalJobsDir, sanitizeJobName } from "$lib/server/jobs";

/**
 * DELETE /api/jobs/[name]
 * Deletes a job from the global jobs directory (removes the YAML file).
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const safeName = sanitizeJobName(params.name);
  if (!safeName) {
    return json({ error: "Invalid job name" }, { status: 400 });
  }

  try {
    const jobsDir = getGlobalJobsDir();
    for (const ext of [".yaml", ".yml"]) {
      const filePath = path.join(jobsDir, `${safeName}${ext}`);
      try {
        await fs.unlink(filePath);
        return json({ ok: true, message: `Deleted job "${params.name}"` });
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
      }
    }
    return json({ error: "Job not found" }, { status: 404 });
  } catch (error) {
    console.error("[Jobs API] Delete failed:", error);
    return json({ error: "Failed to delete job" }, { status: 500 });
  }
};
