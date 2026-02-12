import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as path from "path";
import * as fs from "fs/promises";
import * as yaml from "yaml";
import {
  listGlobalJobs,
  listJobsForViber,
  listViberConfigIds,
  getGlobalJobsDir,
  sanitizeJobName,
  describeCron,
  type JobEntry,
} from "$lib/server/jobs";
import { gatewayClient } from "$lib/server/gateway";

export interface ViberJobsGroup {
  viberId: string;
  jobs: JobEntry[];
}

/**
 * POST /api/jobs
 * Create a new job in the global jobs directory.
 * Body: { name, schedule (cron), prompt, description?, model? }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, schedule, prompt, description, model, nodeId, skills, tools } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return json({ error: "Missing or invalid name" }, { status: 400 });
    }
    if (!schedule || typeof schedule !== "string" || !schedule.trim()) {
      return json({ error: "Missing or invalid schedule (cron expression)" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Missing or invalid prompt" }, { status: 400 });
    }

    const jobName = sanitizeJobName(name.trim());
    const jobsDir = getGlobalJobsDir();
    await fs.mkdir(jobsDir, { recursive: true });

    const jobPath = path.join(jobsDir, `${jobName}.yaml`);
    const config: Record<string, unknown> = {
      name: name.trim(),
      schedule: schedule.trim(),
      prompt: prompt.trim(),
    };
    if (description != null && String(description).trim()) {
      config.description = String(description).trim();
    }
    if (model != null && String(model).trim()) {
      config.model = String(model).trim();
    }
    if (nodeId != null && typeof nodeId === "string" && nodeId.trim()) {
      config.nodeId = nodeId.trim();
    }
    if (Array.isArray(skills) && skills.length > 0) {
      config.skills = skills.filter((s: unknown) => typeof s === "string" && String(s).trim()).map((s: string) => s.trim());
    }
    if (Array.isArray(tools) && tools.length > 0) {
      config.tools = tools.filter((t: unknown) => typeof t === "string" && String(t).trim()).map((t: string) => t.trim());
    }

    await fs.writeFile(jobPath, yaml.stringify(config), "utf8");

    // If a node is selected, push the job to that node so it runs there
    const targetNodeId =
      nodeId != null && typeof nodeId === "string" && nodeId.trim()
        ? nodeId.trim()
        : null;
    if (targetNodeId) {
      const pushed = await gatewayClient.pushJobToNode(targetNodeId, {
        name: name.trim(),
        schedule: schedule.trim(),
        prompt: prompt.trim(),
        ...(description != null && String(description).trim() && { description: String(description).trim() }),
        ...(model != null && String(model).trim() && { model: String(model).trim() }),
        nodeId: targetNodeId,
      });
      if (!pushed) {
        console.warn("[Jobs API] Job saved locally but push to node failed (gateway or node may be unavailable)");
      }
    }

    return json(
      { ok: true, message: `Created job "${name}"`, filename: `${jobName}.yaml` },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Jobs API] Create failed:", error);
    return json({ error: "Failed to create job" }, { status: 500 });
  }
};

export interface NodeJobsGroup {
  nodeId: string;
  nodeName: string;
  jobs: JobEntry[];
}

/**
 * GET /api/jobs
 * Returns all scheduled jobs: global (~/.openviber/jobs), per-viber (vibers/<id>/jobs),
 * and jobs reported by connected nodes (including those created from chat).
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [globalJobs, viberIds, boardJobsResult] = await Promise.all([
      listGlobalJobs(),
      listViberConfigIds(),
      gatewayClient.getNodeJobs(),
    ]);

    const perViber: ViberJobsGroup[] = [];

    for (const viberId of viberIds) {
      const jobs = await listJobsForViber(viberId);
      if (jobs.length > 0) {
        perViber.push({ viberId, jobs });
      }
    }

    // Build set of global job names so we can flag which node jobs are already known
    const globalJobNames = new Set(globalJobs.map((j) => j.name));

    // Convert board server node jobs to JobEntry format
    const nodeJobGroups: NodeJobsGroup[] = (boardJobsResult.nodeJobs ?? []).map(
      (group) => ({
        nodeId: group.nodeId,
        nodeName: group.nodeName,
        jobs: group.jobs
          .filter((j) => !globalJobNames.has(j.name)) // exclude duplicates already in global
          .map((j) => ({
            name: j.name,
            description: j.description,
            schedule: j.schedule,
            scheduleDescription: describeCron(j.schedule),
            model: j.model,
            prompt: j.prompt,
            enabled: true,
            filename: "",
            nodeId: j.nodeId ?? group.nodeId,
          })),
      }),
    ).filter((g) => g.jobs.length > 0);

    const totalJobs =
      globalJobs.length +
      perViber.reduce((s, v) => s + v.jobs.length, 0) +
      nodeJobGroups.reduce((s, g) => s + g.jobs.length, 0);

    return json({
      globalJobs,
      perViberJobs: perViber,
      nodeJobs: nodeJobGroups,
      totalJobs,
    });
  } catch (error) {
    console.error("[Jobs API] Failed to list jobs:", error);
    return json({ error: "Failed to list jobs" }, { status: 500 });
  }
};
