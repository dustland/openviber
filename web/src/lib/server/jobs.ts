/**
 * Shared helpers for listing and describing jobs from the filesystem.
 * Jobs are stored in the global ~/.openviber/jobs/ directory.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { homedir } from "os";
import { env } from "$env/dynamic/private";

export interface JobEntry {
  name: string;
  description?: string;
  schedule: string;
  scheduleDescription: string;
  model?: string;
  prompt?: string;
  enabled: boolean;
  filename: string;
  viberId?: string | null;
}

function getBaseDir(): string {
  return env.OPENVIBER_DATA_DIR || path.join(homedir(), ".openviber");
}

/** Global jobs dir (schedule tool and daemon use this) */
export function getGlobalJobsDir(): string {
  return env.OPENVIBER_JOBS_DIR || path.join(getBaseDir(), "jobs");
}

export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /** Format a day-of-week field (single number, comma list, or range) into readable text. */
  function formatDOW(dow: string): string {
    if (dow === "*") return "";
    const nums = dow.split(",").map((d) => parseInt(d, 10)).filter((n) => !isNaN(n));
    if (nums.length === 0) return dow;

    // Check for common patterns
    const weekdays = [1, 2, 3, 4, 5];
    const weekends = [0, 6];
    const sorted = [...nums].sort((a, b) => a - b);

    if (sorted.length === 5 && sorted.every((v, i) => v === weekdays[i])) return "Mon-Fri";
    if (sorted.length === 2 && sorted.every((v, i) => v === weekends[i])) return "Sat-Sun";
    if (sorted.length === 7) return ""; // every day = no qualifier

    return sorted.map((n) => dayNames[n] ?? String(n)).join(", ");
  }

  const timeStr = `${hour}:${minute.padStart(2, "0")}`;
  const dowLabel = dayOfWeek !== "*" ? formatDOW(dayOfWeek) : "";

  if (minute === "0" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${hour}:00`;
  }
  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every hour";
  }
  if (minute.startsWith("*/") && hour === "*") {
    const suffix = dowLabel ? ` (${dowLabel})` : "";
    return `Every ${minute.slice(2)} minutes${suffix}`;
  }
  if (minute === "0" && hour.startsWith("*/")) {
    const suffix = dowLabel ? ` (${dowLabel})` : "";
    return `Every ${hour.slice(2)} hours${suffix}`;
  }
  if (dayOfWeek !== "*" && dayOfMonth === "*" && month === "*") {
    return `${dowLabel || dayOfWeek} at ${timeStr}`;
  }

  return cron;
}

/** List jobs from the global ~/.openviber/jobs/ directory */
export async function listGlobalJobs(): Promise<JobEntry[]> {
  const jobsDir = getGlobalJobsDir();
  const jobs: JobEntry[] = [];

  try {
    await fs.access(jobsDir);
  } catch {
    return jobs;
  }

  const files = await fs.readdir(jobsDir);

  for (const file of files) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    if (file.includes(".disabled")) continue;

    try {
      const content = await fs.readFile(path.join(jobsDir, file), "utf8");
      const config = yaml.parse(content);

      jobs.push({
        name: config.name ?? file.replace(/\.(yaml|yml)$/, ""),
        description: config.description,
        schedule: config.schedule ?? "",
        scheduleDescription: describeCron(config.schedule ?? ""),
        model: config.model,
        prompt: config.prompt,
        enabled: true,
        filename: file,
        viberId: config.viberId ?? null,
      });
    } catch {
      // skip invalid files
    }
  }

  return jobs;
}

/** Sanitize job name for filename */
export function sanitizeJobName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job";
}
