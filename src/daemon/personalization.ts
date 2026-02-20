/**
 * Personalization Module
 *
 * Implements the "Four-file personalization pattern" (SOUL.md, USER.md, MEMORY.md, IDENTITY.md).
 * This module manages the persistent "soul" and "memory" of the agent, stored as simple Markdown files.
 * This approach (Text-as-Database) allows for simple, grep-able, and transparent memory management,
 * similar to lightweight agent architectures (e.g., Nanobot), but integrated into the robust Viber runtime.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { getViberRoot } from "../utils/paths";

// ==================== Personalization ====================

/**
 * Read a file if it exists, returning its content or null.
 */
async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Convert filename to uppercase stem with original extension (e.g. "SOUL.md")
 * and lowercase stem with original extension (e.g. "soul.md").
 */
function caseVariants(filename: string): { upper: string; lower: string } {
  const ext = path.extname(filename);       // ".md"
  const stem = path.basename(filename, ext); // "SOUL"
  return {
    upper: stem.toUpperCase() + ext,  // "SOUL.md"
    lower: stem.toLowerCase() + ext,  // "soul.md"
  };
}

/**
 * Load the four-file personalization context (SOUL.md, USER.md, MEMORY.md, IDENTITY.md).
 *
 * Path resolution order (per-viber files):
 *   1. ~/.openviber/vibers/{viberId}/SOUL.md  (primary, uppercase)
 *   2. ~/.openviber/vibers/{viberId}/soul.md  (backwards compat, lowercase)
 *   3. ~/.openviber/tasks/{viberId}/SOUL.md   (legacy path, uppercase)
 *   4. ~/.openviber/tasks/{viberId}/soul.md   (legacy path, lowercase)
 *   5. ~/.openviber/SOUL.md                   (root fallback)
 *   6. ~/.openviber/soul.md                   (root fallback, lowercase)
 *
 * USER.md and IDENTITY.md are shared (node-level) at ~/.openviber/,
 * with optional per-viber overrides in vibers/{viberId}/.
 *
 * MEMORY.md follows the same per-viber resolution as SOUL.md.
 */
export async function loadPersonalization(viberId: string = "default"): Promise<string> {
  const root = getViberRoot();
  const viberDir = path.join(root, "vibers", viberId);
  const legacyTaskDir = path.join(root, "tasks", viberId);

  /**
   * Resolve a personalization file with fallback chain:
   * per-viber (uppercase) → per-viber (lowercase) → legacy (uppercase) → legacy (lowercase) → root (uppercase) → root (lowercase)
   */
  async function resolvePerViberFile(filename: string): Promise<string | null> {
    const { upper, lower } = caseVariants(filename);
    return (
      (await readFileIfExists(path.join(viberDir, upper))) ??
      (await readFileIfExists(path.join(viberDir, lower))) ??
      (await readFileIfExists(path.join(legacyTaskDir, upper))) ??
      (await readFileIfExists(path.join(legacyTaskDir, lower))) ??
      (await readFileIfExists(path.join(root, upper))) ??
      (await readFileIfExists(path.join(root, lower)))
    );
  }

  /**
   * Resolve a shared (node-level) file with optional per-viber override:
   * per-viber (uppercase) → per-viber (lowercase) → root (uppercase) → root (lowercase)
   */
  async function resolveSharedFile(filename: string): Promise<string | null> {
    const { upper, lower } = caseVariants(filename);
    return (
      (await readFileIfExists(path.join(viberDir, upper))) ??
      (await readFileIfExists(path.join(viberDir, lower))) ??
      (await readFileIfExists(path.join(root, upper))) ??
      (await readFileIfExists(path.join(root, lower)))
    );
  }

  // SOUL.md: per-viber with root fallback
  const soul = await resolvePerViberFile("SOUL.md");

  // USER.md: shared at root level, with optional per-viber override
  const user = await resolveSharedFile("USER.md");

  // MEMORY.md: per-viber with root fallback
  const memory = await resolvePerViberFile("MEMORY.md");

  // IDENTITY.md: shared at root level, with optional per-viber override
  const identity = await resolveSharedFile("IDENTITY.md");

  const sections: string[] = [];

  if (identity) {
    sections.push(`<identity>\n${identity.trim()}\n</identity>`);
  }
  if (soul) {
    sections.push(`<soul>\n${soul.trim()}\n</soul>`);
  }
  if (user) {
    sections.push(`<user>\n${user.trim()}\n</user>`);
  }
  if (memory) {
    sections.push(`<memory>\n${memory.trim()}\n</memory>`);
  }

  // Inject recent daily memory logs for continuity
  const dailyLogs = await loadRecentDailyLogs(viberId);
  if (dailyLogs) {
    sections.push(`<recent_activity>\n${dailyLogs}\n</recent_activity>`);
  }

  return sections.join("\n\n");
}

// ==================== Daily Memory Logs ====================

/**
 * Get the path for today's daily memory log.
 * Format: ~/.openviber/vibers/{viberId}/memory/YYYY-MM-DD.md
 */
function getDailyLogPath(viberId: string): string {
  const root = getViberRoot();
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(root, "vibers", viberId, "memory", `${date}.md`);
}

/**
 * Append a task summary to today's daily memory log.
 * Called at the end of each task to build organic memory over time.
 */
export async function appendDailyMemory(
  viberId: string,
  summary: {
    taskId: string;
    goal: string;
    outcome: "completed" | "error" | "stopped";
    details?: string;
  }
): Promise<void> {
  const logPath = getDailyLogPath(viberId);
  const dir = path.dirname(logPath);

  try {
    await fs.mkdir(dir, { recursive: true });

    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const entry = [
      `### ${time} — ${summary.goal}`,
      `- **Task**: \`${summary.taskId}\``,
      `- **Outcome**: ${summary.outcome}`,
      ...(summary.details ? [`- **Notes**: ${summary.details}`] : []),
      "",
    ].join("\n");

    // If file doesn't exist yet, add a date header
    let content = entry;
    try {
      await fs.access(logPath);
    } catch {
      const date = new Date().toISOString().slice(0, 10);
      content = `# Daily Log — ${date}\n\n${entry}`;
    }

    await fs.appendFile(logPath, content + "\n");
  } catch (error) {
    // Non-fatal — don't crash the agent over a log write failure
    console.error(`[DailyMemory] Failed to write log for ${viberId}:`, error);
  }
}

/**
 * Load the most recent N days of daily memory logs for context injection.
 * Returns a concatenated string of recent daily logs, newest first.
 */
export async function loadRecentDailyLogs(
  viberId: string,
  days: number = 3
): Promise<string | null> {
  const root = getViberRoot();
  // Primary: vibers/{viberId}/memory/, fallback: tasks/{viberId}/memory/ (legacy)
  let memoryDir = path.join(root, "vibers", viberId, "memory");

  try {
    await fs.access(memoryDir);
  } catch {
    memoryDir = path.join(root, "tasks", viberId, "memory");
  }

  try {
    await fs.access(memoryDir);
  } catch {
    return null; // No memory directory yet
  }

  try {
    const files = await fs.readdir(memoryDir);
    const logFiles = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, days);

    if (logFiles.length === 0) return null;

    const logs: string[] = [];
    for (const file of logFiles) {
      const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
      logs.push(content.trim());
    }

    return logs.join("\n\n---\n\n");
  } catch (error) {
    console.error(`[DailyMemory] Failed to load logs for ${viberId}:`, error);
    return null;
  }
}
