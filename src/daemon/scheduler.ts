import { Cron } from "croner";
import { EventEmitter } from "events";
import * as fs from "fs/promises";
import { watch as fsWatch, type FSWatcher } from "fs";
import * as path from "path";
import * as yaml from "yaml";


export interface CronJobConfig {
  name: string;
  description?: string;
  schedule: string;
  agent?: string;
  provider?: string;
  model?: string;
  skills?: string[];
  tools?: string[];
  prompt: string;
  /** When set, job is intended for this node (daemon id). Hub may push only jobs matching this node. */
  nodeId?: string;
}

/**
 * Subset of CronJobConfig safe for reporting over the network.
 * Excludes internal fields like agent, provider, skills, tools.
 */
export interface JobSummary {
  name: string;
  description?: string;
  schedule: string;
  prompt: string;
  model?: string;
  nodeId?: string;
}

export class JobScheduler extends EventEmitter {
  private jobs: Map<string, Cron> = new Map();
  private active: boolean = false;
  private watcher: FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  private loadedConfigs: CronJobConfig[] = [];

  constructor(private jobsDir: string) {
    super();
  }

  /** Get the list of currently loaded job configs (safe for reporting). */
  getLoadedJobs(): JobSummary[] {
    return this.loadedConfigs.map((c) => ({
      name: c.name,
      description: c.description,
      schedule: c.schedule,
      prompt: c.prompt,
      model: c.model,
      nodeId: c.nodeId,
    }));
  }

  async start() {
    this.active = true;
    await this.loadJobs();
    this.startWatcher();
  }

  async stop() {
    this.active = false;
    this.stopWatcher();
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
  }

  /** Reload jobs from disk (e.g. after receiving a new job from the hub). */
  async reload(): Promise<void> {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
    await this.loadJobs();
  }

  /**
   * Watch the jobs directory for file changes and auto-reload.
   * This ensures jobs created by tools (e.g. create_scheduled_job from chat)
   * are picked up without requiring a daemon restart.
   */
  private startWatcher(): void {
    try {
      this.watcher = fsWatch(this.jobsDir, (_eventType, filename) => {
        if (!filename) return;
        if (!filename.endsWith(".yaml") && !filename.endsWith(".yml")) return;
        this.debouncedReload();
      });
      this.watcher.on("error", () => {
        // Directory may have been removed; stop watching silently
        this.stopWatcher();
      });
    } catch {
      // Directory might not exist yet — that's fine, watcher is optional
    }
  }

  private stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  /** Debounced reload to avoid rapid-fire reloads when multiple files change. */
  private debouncedReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(async () => {
      this.reloadTimer = null;
      if (!this.active) return;
      console.log("[Scheduler] Detected jobs directory change, reloading...");
      try {
        await this.reload();
      } catch (err) {
        console.error("[Scheduler] Reload after file change failed:", err);
      }
    }, 500);
  }

  private async loadJobs() {
    this.loadedConfigs = [];
    try {
      // Check if directory exists
      try {
        await fs.access(this.jobsDir);
      } catch {
        console.warn(`[Scheduler] Jobs directory not found: ${this.jobsDir}`);
        this.emit("jobs:loaded", this.getLoadedJobs());
        return;
      }

      const files = await fs.readdir(this.jobsDir);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content = await fs.readFile(path.join(this.jobsDir, file), "utf8");
          try {
            const config = yaml.parse(content) as CronJobConfig;
            this.loadedConfigs.push(config);
            this.scheduleJob(config);
          } catch (err) {
            console.error(`[Scheduler] Failed to parse job ${file}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[Scheduler] Error loading jobs:", err);
    }

    // Notify listeners (e.g. the controller) so they can report to the hub
    this.emit("jobs:loaded", this.getLoadedJobs());
  }

  private scheduleJob(config: CronJobConfig) {
    console.log(`[Scheduler] Scheduling job: ${config.name} (${config.schedule})`);

    // Handle "interval: 3s" style if user uses it, though we recommend standard Cron
    // Croner supports "ISO 8601 duration" or pattern.
    // If config.schedule starts with "*", assume cron.
    // If it is a number, assume ms?

    // For specific antigravity case: "*/3 * * * * *" is every 3 seconds.

    try {
      const job = new Cron(config.schedule, async () => {
        if (!this.active) return;
        await this.executeJob(config);
      });

      this.jobs.set(config.name, job);
    } catch (err) {
      console.error(`[Scheduler] Invalid schedule for ${config.name}:`, err);
    }
  }

  private async executeJob(config: CronJobConfig) {
    // If model is specified, use full Agent
    if (config.model) {
      try {
        const { Agent } = await import("../viber/agent");

        const agent = new Agent({
          name: config.name,
          description: config.description || "Cron Job Agent",
          skills: config.skills,
          tools: config.tools,
          llm: {
            provider: config.provider || "openrouter",
            model: config.model
          },
        });

        // Execute prompt
        const result = await agent.generateText({
          messages: [{ role: "user", content: config.prompt }]
        });

        // Log results comprehensively (single line)
        const parts: string[] = [];

        // Tool results (compact) — skip noiseless health OK results
        if (result.toolResults && result.toolResults.length > 0) {
          for (const tr of result.toolResults) {
            const isHealthOk =
              tr.output &&
              typeof tr.output === "object" &&
              "status" in tr.output &&
              (tr.output as any).status === "HEALTHY";
            if (isHealthOk) continue;

            const resultStr =
              typeof tr.output === "object"
                ? JSON.stringify(tr.output) // No pretty-print
                : String(tr.output);
            parts.push(`${tr.toolName}: ${resultStr}`);
          }
        }

        // LLM text response if any
        if (result.text) {
          parts.push(result.text.slice(0, 100));  // Truncate long text
        }

        // Final output (single line)
        if (parts.length > 0) {
          console.log(`[${config.name}] ${parts.join(' | ')}`);
        }

      } catch (err) {
        console.error(`[${config.name}] Agent execution failed:`, err);
      }
      return;
    }

    // Fallback: Hardcoded optimization for BrowserCDP if no model specified (Legacy/Fast Path)
    // This allows "script-like" execution without LLM inference cost if the prompt matches known patterns
    // (For now, we keep the Healer optimization as a fallback or if user omits model)
    // Fallback or legacy logic removed for cleaner architecture.
    if (!config.model) {
      console.warn(`[${config.name}] No model specified, skipping execution.`);
    }
  }
}
