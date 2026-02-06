import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { homedir } from "os";
import { env } from "$env/dynamic/private";

interface Job {
  name: string;
  description?: string;
  schedule: string;
  model?: string;
  prompt?: string;
  enabled: boolean;
  filename: string;
}

function getJobsDir(viberId: string): string {
  // Jobs are stored per-viber in ~/.openviber/vibers/<viberId>/jobs/
  const baseDir = env.OPENVIBER_DATA_DIR || path.join(homedir(), ".openviber");
  return path.join(baseDir, "vibers", viberId, "jobs");
}

// Human-readable cron description
function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (minute === "0" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${hour}:00`;
  }
  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every hour";
  }
  if (minute.startsWith("*/") && hour === "*") {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (minute === "0" && hour.startsWith("*/")) {
    return `Every ${hour.slice(2)} hours`;
  }
  if (dayOfWeek !== "*" && dayOfMonth === "*") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const day = days[parseInt(dayOfWeek)] || dayOfWeek;
    return `${day} at ${hour}:${minute.padStart(2, "0")}`;
  }

  return cron;
}

export const GET: RequestHandler = async ({ params }) => {
  const jobsDir = getJobsDir(params.id);
  const jobs: Job[] = [];

  try {
    await fs.access(jobsDir);
  } catch {
    // Jobs directory doesn't exist yet for this viber
    return json({ jobs: [], count: 0 });
  }

  try {
    const files = await fs.readdir(jobsDir);

    for (const file of files) {
      if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;

      try {
        const content = await fs.readFile(path.join(jobsDir, file), "utf8");
        const config = yaml.parse(content);

        jobs.push({
          name: config.name || file.replace(/\.(yaml|yml)$/, ""),
          description: config.description,
          schedule: config.schedule,
          model: config.model,
          prompt: config.prompt,
          enabled: !file.includes(".disabled"),
          filename: file,
        });
      } catch (err) {
        console.error(`[Jobs API] Failed to parse ${file}:`, err);
      }
    }

    return json({
      jobs,
      count: jobs.length,
      // Add human-readable schedule descriptions
      jobsWithDescriptions: jobs.map(j => ({
        ...j,
        scheduleDescription: describeCron(j.schedule),
      })),
    });
  } catch (err) {
    console.error("[Jobs API] Error listing jobs:", err);
    return json({ error: "Failed to list jobs" }, { status: 500 });
  }
};
