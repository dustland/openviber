/**
 * Schedule Job Tool - Create and manage scheduled jobs via natural language
 * 
 * Enables: "Check weather at 8am daily" → Creates YAML job automatically
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { homedir } from "os";

// Natural language time patterns
const TIME_PATTERNS: Array<{ pattern: RegExp; toCron: (m: RegExpMatchArray) => string }> = [
    // "8am daily" or "8:30am every day"
    {
        pattern: /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:daily|every\s*day)/i,
        toCron: (m) => {
            let hour = parseInt(m[1]);
            const minute = m[2] ? parseInt(m[2]) : 0;
            if (m[3].toLowerCase() === "pm" && hour !== 12) hour += 12;
            if (m[3].toLowerCase() === "am" && hour === 12) hour = 0;
            return `${minute} ${hour} * * *`;
        }
    },
    // "every hour"
    {
        pattern: /every\s*hour/i,
        toCron: () => "0 * * * *"
    },
    // "every N hours"
    {
        pattern: /every\s*(\d+)\s*hours?/i,
        toCron: (m) => `0 */${m[1]} * * *`
    },
    // "every N minutes"
    {
        pattern: /every\s*(\d+)\s*minutes?/i,
        toCron: (m) => `*/${m[1]} * * * *`
    },
    // "Monday 9am" or "on Monday at 9am"
    {
        pattern: /(?:on\s*)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
        toCron: (m) => {
            const days: Record<string, number> = {
                sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
                thursday: 4, friday: 5, saturday: 6
            };
            const day = days[m[1].toLowerCase()];
            let hour = parseInt(m[2]);
            const minute = m[3] ? parseInt(m[3]) : 0;
            if (m[4]?.toLowerCase() === "pm" && hour !== 12) hour += 12;
            if (m[4]?.toLowerCase() === "am" && hour === 12) hour = 0;
            return `${minute} ${hour} * * ${day}`;
        }
    },
    // "every 30 seconds" (6-field cron)
    {
        pattern: /every\s*(\d+)\s*seconds?/i,
        toCron: (m) => `*/${m[1]} * * * * *`
    },
];

/**
 * Parse natural language time to cron expression
 */
function parseNaturalTime(input: string): string | null {
    for (const { pattern, toCron } of TIME_PATTERNS) {
        const match = input.match(pattern);
        if (match) {
            return toCron(match);
        }
    }
    return null;
}

/**
 * Get jobs directory path
 */
function getJobsDir(): string {
    return process.env.OPENVIBER_JOBS_DIR || path.join(homedir(), ".openviber", "jobs");
}

/**
 * Ensure jobs directory exists
 */
async function ensureJobsDir(): Promise<string> {
    const dir = getJobsDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

/**
 * Sanitize job name for filename
 */
function sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Tool definitions using CoreTool interface (zod schema + execute function)
export const createJobTool = {
    description: `Create a scheduled job that runs automatically. Use natural language for timing like "8am daily", "every hour", "Monday 9am", "every 30 minutes". The job will execute the given task/prompt on the schedule.`,
    parameters: z.object({
        name: z.string().describe("Short name for the job, e.g. 'daily-weather'"),
        schedule: z.string().describe("When to run, in natural language like '8am daily' or 'every hour'"),
        task: z.string().describe("What the job should do - the prompt/task to execute"),
        model: z.string().optional().describe("Model to use (default: deepseek/deepseek-chat)"),
        skills: z.array(z.string()).optional().describe("Skills to enable for this job"),
    }),
    execute: async (args: { name: string; schedule: string; task: string; model?: string; skills?: string[] }) => {
        const { name, schedule, task, model, skills } = args;
        // Parse natural language to cron
        let cronExpression = parseNaturalTime(schedule);

        // If not parsed, try using as-is (might be valid cron already)
        if (!cronExpression) {
            // Basic validation: should have 5-6 space-separated parts
            if (/^[\d\*\/\-\,]+(\s+[\d\*\/\-\,]+){4,5}$/.test(schedule.trim())) {
                cronExpression = schedule.trim();
            } else {
                return {
                    success: false,
                    error: `Could not parse schedule "${schedule}". Try formats like "8am daily", "every hour", or "every 30 minutes".`
                };
            }
        }

        const jobName = sanitizeName(name);
        const jobsDir = await ensureJobsDir();
        const jobPath = path.join(jobsDir, `${jobName}.yaml`);

        const jobConfig = {
            name: name,
            description: `Scheduled job created via chat`,
            schedule: cronExpression,
            provider: "openrouter",
            model: model || "deepseek/deepseek-chat",
            skills: skills || [],
            prompt: task,
        };

        const yamlContent = yaml.stringify(jobConfig);
        await fs.writeFile(jobPath, yamlContent, "utf8");

        return {
            success: true,
            message: `Created job "${name}" - will run at schedule: ${cronExpression}`,
            jobPath,
            cronExpression,
            nextSteps: "Restart OpenViber to load the new job, or it will be picked up on next restart."
        };
    }
};

export const listJobsTool = {
    description: "List all scheduled jobs",
    parameters: z.object({}),
    execute: async () => {
        const jobsDir = getJobsDir();

        try {
            await fs.access(jobsDir);
        } catch {
            return { jobs: [], message: "No jobs directory found. Create a job first." };
        }

        const files = await fs.readdir(jobsDir);
        const jobs: Array<{ name: string; schedule: string; task: string; enabled: boolean }> = [];

        for (const file of files) {
            if (file.endsWith(".yaml") || file.endsWith(".yml")) {
                const content = await fs.readFile(path.join(jobsDir, file), "utf8");
                try {
                    const config = yaml.parse(content);
                    jobs.push({
                        name: config.name || file,
                        schedule: config.schedule,
                        task: config.prompt?.slice(0, 100) + (config.prompt?.length > 100 ? "..." : ""),
                        enabled: !file.includes(".disabled")
                    });
                } catch {
                    // Skip invalid files
                }
            }
        }

        return { jobs, count: jobs.length };
    }
};

export const deleteJobTool = {
    description: "Delete a scheduled job by name",
    parameters: z.object({
        name: z.string().describe("Name of the job to delete")
    }),
    execute: async (args: { name: string }) => {
        const { name } = args;
        const jobsDir = getJobsDir();
        const jobName = sanitizeName(name);

        // Try both .yaml and .yml extensions
        for (const ext of [".yaml", ".yml"]) {
            const jobPath = path.join(jobsDir, `${jobName}${ext}`);
            try {
                await fs.unlink(jobPath);
                return {
                    success: true,
                    message: `Deleted job "${name}". Changes take effect on next restart.`
                };
            } catch {
                // Try next extension
            }
        }

        return {
            success: false,
            error: `Job "${name}" not found`
        };
    }
};

// Export all schedule tools
export const scheduleTools: Record<string, any> = {
    create_scheduled_job: createJobTool,
    list_scheduled_jobs: listJobsTool,
    delete_scheduled_job: deleteJobTool,
};
