/**
 * Shared helpers for listing and describing jobs from the filesystem.
 * - Global jobs: ~/.openviber/jobs/ (used by schedule tool and daemon)
 * - Per-viber jobs: ~/.openviber/vibers/<viberId>/jobs/
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
  nodeId?: string | null;
}

function getBaseDir(): string {
  return env.OPENVIBER_DATA_DIR || path.join(homedir(), ".openviber");
}

/** Global jobs dir (schedule tool and daemon use this) */
export function getGlobalJobsDir(): string {
  return env.OPENVIBER_JOBS_DIR || path.join(getBaseDir(), "jobs");
}

export function getJobsDir(viberId: string): string {
  return path.join(getBaseDir(), "vibers", viberId, "jobs");
}

export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

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
    const day = days[parseInt(dayOfWeek)] ?? dayOfWeek;
    return `${day} at ${hour}:${minute.padStart(2, "0")}`;
  }

  return cron;
}

export async function listJobsForViber(viberId: string): Promise<JobEntry[]> {
  const jobsDir = getJobsDir(viberId);
  const jobs: JobEntry[] = [];

  try {
    await fs.access(jobsDir);
  } catch {
    return jobs;
  }

  const files = await fs.readdir(jobsDir);

  for (const file of files) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;

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
        enabled: !file.includes(".disabled"),
        filename: file,
        nodeId: config.nodeId ?? null,
      });
    } catch {
      // skip invalid files
    }
  }

  return jobs;
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
        nodeId: config.nodeId ?? null,
      });
    } catch {
      // skip invalid files
    }
  }

  return jobs;
}

/** List viber config ids by scanning ~/.openviber/vibers/ directories */
export async function listViberConfigIds(): Promise<string[]> {
  const baseDir = getBaseDir();
  const vibersDir = path.join(baseDir, "vibers");

  try {
    const entries = await fs.readdir(vibersDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Sanitize job name for filename */
export function sanitizeJobName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job";
}
