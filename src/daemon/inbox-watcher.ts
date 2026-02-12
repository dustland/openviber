/**
 * Inbox Watcher
 *
 * Monitors an INBOX.md file in the viber's directory. When the user
 * drops text into it, the daemon picks it up, emits a "task" event,
 * and clears the file. Enables "drop-file-to-work" workflows without
 * needing a WebSocket connection or cron job.
 *
 * Usage:
 *   const watcher = new InboxWatcher(viberId, (goal) => { ... });
 *   watcher.start();
 *   // later:
 *   watcher.stop();
 */

import * as fs from "fs/promises";
import * as path from "path";
import { watch, type FSWatcher } from "fs";
import { getViberRoot } from "../utils/paths";
import { createLogger } from "../utils/logger";

export class InboxWatcher {
  private watcher: FSWatcher | null = null;
  private processing = false;
  private log;

  /**
   * @param viberId  The viber whose inbox to watch
   * @param onInbox  Callback when inbox content is detected
   */
  constructor(
    private viberId: string,
    private onInbox: (content: string) => void
  ) {
    this.log = createLogger("inbox-watcher", { viberId });
  }

  /** Path to the INBOX.md file */
  private get inboxPath(): string {
    return path.join(getViberRoot(), "vibers", this.viberId, "INBOX.md");
  }

  /** Start watching the inbox file */
  async start(): Promise<void> {
    // Ensure the viber directory exists
    const dir = path.dirname(this.inboxPath);
    await fs.mkdir(dir, { recursive: true });

    // Check if there's already content in the inbox
    await this.checkInbox();

    // Watch for changes
    try {
      this.watcher = watch(dir, (eventType, filename) => {
        if (filename === "INBOX.md") {
          void this.checkInbox();
        }
      });
      this.log.info("Inbox watcher started", { path: this.inboxPath });
    } catch (err) {
      this.log.error("Failed to start inbox watcher", {
        error: String(err),
      });
    }
  }

  /** Stop watching */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.log.info("Inbox watcher stopped");
    }
  }

  /** Check the inbox file for content, process it, and clear */
  private async checkInbox(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const content = await fs.readFile(this.inboxPath, "utf-8");
      const trimmed = content.trim();

      if (trimmed.length === 0) {
        return;
      }

      this.log.info("Inbox content detected", {
        length: trimmed.length,
      });

      // Clear the inbox file first to avoid re-processing
      await fs.writeFile(this.inboxPath, "", "utf-8");

      // Emit the content to the callback
      this.onInbox(trimmed);
    } catch (err: any) {
      // File doesn't exist yet — that's fine
      if (err?.code !== "ENOENT") {
        this.log.error("Inbox check error", { error: String(err) });
      }
    } finally {
      this.processing = false;
    }
  }
}
