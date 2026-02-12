/**
 * Email Watcher
 *
 * Core daemon infrastructure that polls a Gmail inbox via the Google Gmail
 * API (googleapis) for emails matching configurable natural-language rules.
 * When a match is found, it emits an event that can trigger viber task execution.
 *
 * Rules are defined in ~/.openviber/email-rules.yaml with a simple format:
 *
 *   rules:
 *     - when: "deployment failure from railway"
 *       do: "diagnose and fix the build error"
 *     - when: "github issue assigned"
 *       do: "review the issue and start working on it"
 *
 * Prerequisites:
 *   - Google OAuth connection configured via Settings > Integrations
 *   - OAuth tokens available in daemon config (pulled from hub)
 *
 * Usage:
 *   const watcher = new EmailWatcher();
 *   watcher.setOAuthTokens({ accessToken: '...', refreshToken: '...' });
 *   watcher.on("email:triggered", ({ rule, email, prompt }) => { ... });
 *   await watcher.start();
 */

import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { getViberRoot } from "../utils/paths";
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

interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
}

// ==================== Helpers ====================

/**
 * Create a Gmail client from OAuth tokens.
 * Lazily imports googleapis to avoid bundling when not needed.
 */
async function createGmailClient(tokens: GoogleOAuthTokens) {
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken || undefined,
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function getHeader(payload: any, name: string): string {
  if (!payload?.headers) return "";
  const header = payload.headers.find(
    (h: any) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || "";
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
  private oauthTokens: GoogleOAuthTokens | null = null;

  /** Path to email rules config file */
  private get rulesPath(): string {
    return path.join(getViberRoot(), RULES_FILE);
  }

  /**
   * Set OAuth tokens for Gmail API access.
   * Called by the daemon controller when it receives tokens from the hub.
   */
  setOAuthTokens(tokens: GoogleOAuthTokens): void {
    this.oauthTokens = tokens;
  }

  /**
   * Start the email watcher.
   * Loads rules and begins polling Gmail inbox via Google API.
   */
  async start(): Promise<void> {
    if (!this.oauthTokens) {
      this.log.warn(
        "Email watcher disabled: Google OAuth tokens not available. " +
        "Connect your Google account in Settings > Integrations.",
      );
      return;
    }

    // Verify tokens work
    try {
      const gmail = await createGmailClient(this.oauthTokens);
      await gmail.users.getProfile({ userId: "me" });
    } catch (err: any) {
      this.log.warn(
        "Email watcher disabled: Gmail API authentication failed. " +
        "Re-connect your Google account in Settings > Integrations.",
        { error: err?.message },
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
      this.pollInterval * 1000,
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
   * Uses the Google Gmail API with OAuth.
   */
  private async pollInbox(): Promise<void> {
    if (!this.running || !this.oauthTokens) return;

    try {
      const gmail = await createGmailClient(this.oauthTokens);

      // Search for unread messages
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: "is:unread",
        maxResults: 50,
      });

      const messageIds = listRes.data.messages || [];
      if (messageIds.length === 0) return;

      // Fetch metadata for each message
      const messages: ParsedEmail[] = [];
      for (const msg of messageIds) {
        try {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id!,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          });

          messages.push({
            messageId: msg.id || "",
            uid: 0,
            from: getHeader(detail.data.payload, "From"),
            subject: getHeader(detail.data.payload, "Subject"),
            snippet: detail.data.snippet || "",
            date: detail.data.payload
              ? new Date(getHeader(detail.data.payload, "Date"))
              : new Date(),
          });
        } catch (err: any) {
          this.log.warn("Failed to fetch message details", {
            messageId: msg.id,
            error: err?.message,
          });
        }
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
          email.snippet ? `Snippet: ${email.snippet}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        // Emit trigger event
        this.emit("email:triggered", {
          rule: matchedRule,
          email,
          prompt,
        } as EmailTriggerEvent);

        // Mark as read to prevent re-triggering
        if (matchedRule.markRead !== false && email.messageId) {
          try {
            await gmail.users.messages.modify({
              userId: "me",
              id: email.messageId,
              requestBody: {
                removeLabelIds: ["UNREAD"],
              },
            });
          } catch (flagErr: any) {
            this.log.warn("Failed to mark email as read", {
              messageId: email.messageId,
              error: flagErr?.message,
            });
          }
        }
      }
    } catch (err: any) {
      this.log.error("Email poll failed", {
        error: err?.message || String(err),
      });
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
   *   "deployment failure from railway" -> keywords: [deployment, failure, railway]
   *   -> matches email with from: "notifications@railway.com", subject: "Deployment failure..."
   */
  matchEmail(email: ParsedEmail): EmailRule | null {
    const searchable =
      `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();

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
