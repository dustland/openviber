/**
 * Email Watcher
 *
 * Core daemon infrastructure that polls a Gmail inbox via IMAP for emails
 * matching configurable natural-language rules. When a match is found,
 * it emits an event that can trigger viber task execution.
 *
 * Rules are defined in ~/.openviber/email-rules.yaml with a simple format:
 *
 *   rules:
 *     - when: "deployment failure from railway"
 *       do: "diagnose and fix the build error"
 *     - when: "github issue assigned"
 *       do: "review the issue and start working on it"
 *
 * Environment:
 *   GMAIL_ADDRESS      — Gmail address to watch
 *   GMAIL_APP_PASSWORD — Google App Password (not regular password)
 *
 * Usage:
 *   const watcher = new EmailWatcher();
 *   watcher.on("email:triggered", ({ rule, email, prompt }) => { ... });
 *   await watcher.start();
 */

import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { getViberRoot } from "../config";
import { createLogger } from "../utils/logger";

// ==================== Types ====================

export interface EmailRule {
  /** Natural-language description of when to trigger (e.g. "deployment failure from railway") */
  when: string;
  /** Natural-language action prompt (e.g. "diagnose and fix the build error") */
  do: string;
  /** Optional: specific viber to target (defaults to any active viber) */
  viber?: string;
  /** Whether to mark matched emails as read (default: true) */
  markRead?: boolean;
}

export interface EmailRulesConfig {
  /** Poll interval in seconds (default: 60) */
  interval?: number;
  rules: EmailRule[];
}

export interface ParsedEmail {
  messageId: string;
  uid: number;
  from: string;
  subject: string;
  snippet: string;
  date: Date;
}

export interface EmailTriggerEvent {
  rule: EmailRule;
  email: ParsedEmail;
  /** Combined prompt: the rule's "do" + email context */
  prompt: string;
}

// ==================== Email Watcher ====================

const DEFAULT_POLL_INTERVAL_SEC = 60;
const RULES_FILE = "email-rules.yaml";

export class EmailWatcher extends EventEmitter {
  private pollTimer: NodeJS.Timeout | null = null;
  private running = false;
  private rules: EmailRule[] = [];
  private pollInterval = DEFAULT_POLL_INTERVAL_SEC;
  private log = createLogger("email-watcher");

  /** Path to email rules config file */
  private get rulesPath(): string {
    return path.join(getViberRoot(), RULES_FILE);
  }

  /**
   * Start the email watcher.
   * Loads rules and begins polling Gmail inbox.
   */
  async start(): Promise<void> {
    // Check for credentials
    if (!process.env.GMAIL_ADDRESS || !process.env.GMAIL_APP_PASSWORD) {
      this.log.warn(
        "Email watcher disabled: GMAIL_ADDRESS and GMAIL_APP_PASSWORD env vars required"
      );
      return;
    }

    // Load rules
    await this.loadRules();

    if (this.rules.length === 0) {
      this.log.info("No email rules configured, email watcher idle", {
        rulesPath: this.rulesPath,
      });
      return;
    }

    this.running = true;
    this.log.info("Email watcher started", {
      rules: this.rules.length,
      intervalSec: this.pollInterval,
    });

    // Initial check
    await this.pollInbox();

    // Schedule recurring polls
    this.pollTimer = setInterval(
      () => void this.pollInbox(),
      this.pollInterval * 1000
    );
  }

  /** Stop the watcher */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.log.info("Email watcher stopped");
  }

  /** Reload rules from disk */
  async reloadRules(): Promise<void> {
    await this.loadRules();
    this.log.info("Email rules reloaded", { count: this.rules.length });
  }

  // ==================== Internal ====================

  /**
   * Load rules from ~/.openviber/email-rules.yaml
   */
  private async loadRules(): Promise<void> {
    try {
      const content = await fs.readFile(this.rulesPath, "utf-8");
      const config = yaml.parse(content) as EmailRulesConfig;
      this.rules = config.rules || [];
      this.pollInterval = config.interval || DEFAULT_POLL_INTERVAL_SEC;
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        this.log.info("No email-rules.yaml found", {
          path: this.rulesPath,
        });
        this.rules = [];
      } else {
        this.log.error("Failed to load email rules", {
          error: String(err),
        });
      }
    }
  }

  /**
   * Poll Gmail inbox for unread emails and match against rules.
   * Uses imapflow to connect via IMAP.
   */
  private async pollInbox(): Promise<void> {
    if (!this.running) return;

    let client: any;
    try {
      // Dynamic import to avoid issues when imapflow is not installed
      const { ImapFlow } = await import("imapflow");

      client = new ImapFlow({
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: {
          user: process.env.GMAIL_ADDRESS!,
          pass: process.env.GMAIL_APP_PASSWORD!,
        },
        logger: false,
      });

      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        // Fetch unread messages
        const messages: ParsedEmail[] = [];

        for await (const msg of client.fetch(
          { seen: false },
          { envelope: true, source: false }
        )) {
          const envelope = msg.envelope;
          if (!envelope) continue;

          messages.push({
            messageId: envelope.messageId || "",
            uid: msg.uid,
            from:
              envelope.from?.[0]?.address ||
              envelope.from?.[0]?.name ||
              "unknown",
            subject: envelope.subject || "",
            snippet: "",
            date: envelope.date ? new Date(envelope.date) : new Date(),
          });
        }

        // Match emails against rules
        for (const email of messages) {
          const matchedRule = this.matchEmail(email);
          if (!matchedRule) continue;

          this.log.info("Email matched rule", {
            rule: matchedRule.when,
            from: email.from,
            subject: email.subject,
          });

          // Build the prompt with email context
          const prompt = [
            matchedRule.do,
            "",
            "--- Email context ---",
            `From: ${email.from}`,
            `Subject: ${email.subject}`,
            `Date: ${email.date.toISOString()}`,
          ].join("\n");

          // Emit trigger event
          this.emit("email:triggered", {
            rule: matchedRule,
            email,
            prompt,
          } as EmailTriggerEvent);

          // Mark as read to prevent re-triggering
          if (matchedRule.markRead !== false) {
            try {
              await client.messageFlagsAdd(email.uid, ["\\Seen"], {
                uid: true,
              });
            } catch (flagErr: any) {
              this.log.warn("Failed to mark email as read", {
                uid: email.uid,
                error: flagErr?.message,
              });
            }
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err: any) {
      this.log.error("Email poll failed", {
        error: err?.message || String(err),
      });
      // Try to clean up the connection
      try {
        await client?.logout();
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  /**
   * Match an email against rules using keyword extraction from the
   * natural-language "when" clause.
   *
   * The "when" string is split into keywords and each keyword is
   * checked against the email's from + subject fields (case-insensitive).
   * A rule matches if ALL keywords are found in the email metadata.
   *
   * Examples:
   *   "deployment failure from railway" → keywords: [deployment, failure, railway]
   *   → matches email with from: "notifications@railway.com", subject: "Deployment failure..."
   */
  matchEmail(email: ParsedEmail): EmailRule | null {
    const searchable = `${email.from} ${email.subject}`.toLowerCase();

    for (const rule of this.rules) {
      const keywords = this.extractKeywords(rule.when);
      const allMatch = keywords.every((kw) => searchable.includes(kw));
      if (allMatch) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Extract meaningful keywords from a natural-language "when" clause.
   * Strips common stop words to focus on the signal.
   */
  private extractKeywords(when: string): string[] {
    const stopWords = new Set([
      "a", "an", "the", "is", "are", "was", "were", "be", "been",
      "from", "to", "for", "of", "in", "on", "at", "by", "with",
      "and", "or", "not", "no", "if", "when", "get", "got", "gets",
      "me", "my", "i", "we", "our", "you", "your",
      "that", "this", "it", "its",
    ]);

    return when
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stopWords.has(w));
  }
}
