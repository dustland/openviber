import { z } from "zod";
import type { CoreTool } from "../../core/tool";

const MAX_RESULTS = 50;

// ==================== Helpers ====================

function getCredentials(): { user: string; pass: string } {
  const user = process.env.GMAIL_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Gmail credentials not configured. Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD env vars."
    );
  }
  return { user, pass };
}

// ==================== Tool exports ====================

export function getTools(): Record<string, CoreTool> {
  return {
    gmail_search: {
      description:
        "Search Gmail inbox for emails matching a query. Returns subject, sender, date, and UID for each match. Use gmail_read to get the full body.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Search terms to match against sender and subject"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .optional()
          .default(10)
          .describe("Maximum number of results (default: 10)"),
        unreadOnly: z
          .boolean()
          .optional()
          .default(true)
          .describe("Only return unread emails (default: true)"),
      }),
      execute: async (args: {
        query: string;
        limit?: number;
        unreadOnly?: boolean;
      }) => {
        try {
          const creds = getCredentials();
          const { ImapFlow } = await import("imapflow");

          const client = new ImapFlow({
            host: "imap.gmail.com",
            port: 993,
            secure: true,
            auth: creds,
            logger: false,
          });

          await client.connect();
          const lock = await client.getMailboxLock("INBOX");

          const results: Array<{
            uid: number;
            from: string;
            subject: string;
            date: string;
            read: boolean;
          }> = [];

          try {
            const searchCriteria: any = args.unreadOnly !== false ? { seen: false } : {};

            for await (const msg of client.fetch(searchCriteria, {
              envelope: true,
              flags: true,
            })) {
              const envelope = msg.envelope;
              if (!envelope) continue;

              const from =
                envelope.from?.[0]?.address ||
                envelope.from?.[0]?.name ||
                "unknown";
              const subject = envelope.subject || "";

              // Client-side keyword filter
              const searchable = `${from} ${subject}`.toLowerCase();
              const keywords = args.query
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 1);
              const matches = keywords.every((kw) =>
                searchable.includes(kw)
              );
              if (!matches) continue;

              results.push({
                uid: msg.uid,
                from,
                subject,
                date: envelope.date
                  ? new Date(envelope.date).toISOString()
                  : "unknown",
                read: msg.flags?.has("\\Seen") || false,
              });

              if (results.length >= (args.limit || 10)) break;
            }
          } finally {
            lock.release();
          }

          await client.logout();

          return {
            ok: true,
            count: results.length,
            emails: results,
            summary: `Found ${results.length} email(s) matching "${args.query}"`,
          };
        } catch (err: any) {
          return {
            ok: false,
            count: 0,
            emails: [],
            error: err?.message || String(err),
            summary: "Search failed",
          };
        }
      },
    },

    gmail_read: {
      description:
        "Read the full body of an email by its UID. Get UIDs from gmail_search results.",
      inputSchema: z.object({
        uid: z
          .number()
          .int()
          .min(1)
          .describe("Message UID from gmail_search results"),
      }),
      execute: async (args: { uid: number }) => {
        try {
          const creds = getCredentials();
          const { ImapFlow } = await import("imapflow");

          const client = new ImapFlow({
            host: "imap.gmail.com",
            port: 993,
            secure: true,
            auth: creds,
            logger: false,
          });

          await client.connect();
          const lock = await client.getMailboxLock("INBOX");

          let result: {
            uid: number;
            from: string;
            subject: string;
            date: string;
            body: string;
          } | null = null;

          try {
            const msg = await client.fetchOne(
              String(args.uid),
              { envelope: true, source: true },
              { uid: true }
            );

            if (msg) {
              const envelope = msg.envelope;
              let body = "";

              if (msg.source) {
                // Parse the raw source to extract text content
                const rawSource = msg.source.toString("utf-8");
                // Simple extraction: take text after the headers
                const headerEnd = rawSource.indexOf("\r\n\r\n");
                if (headerEnd !== -1) {
                  body = rawSource.slice(headerEnd + 4);
                  // Strip HTML tags if present
                  body = body.replace(/<[^>]+>/g, "");
                  // Decode common MIME encoding (quoted-printable basics)
                  body = body.replace(/=\r?\n/g, "");
                  body = body.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
                    String.fromCharCode(parseInt(hex, 16))
                  );
                  // Truncate if too long
                  if (body.length > 8000) {
                    body =
                      body.slice(0, 8000) +
                      `\n...[truncated ${body.length - 8000} chars]`;
                  }
                }
              }

              result = {
                uid: args.uid,
                from:
                  envelope?.from?.[0]?.address ||
                  envelope?.from?.[0]?.name ||
                  "unknown",
                subject: envelope?.subject || "",
                date: envelope?.date
                  ? new Date(envelope.date).toISOString()
                  : "unknown",
                body: body.trim(),
              };
            }
          } finally {
            lock.release();
          }

          await client.logout();

          if (!result) {
            return {
              ok: false,
              error: `No email found with UID ${args.uid}`,
              summary: "Email not found",
            };
          }

          return {
            ok: true,
            email: result,
            summary: `Read email: "${result.subject}" from ${result.from}`,
          };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            summary: "Read failed",
          };
        }
      },
    },

    gmail_send: {
      description:
        "Send an email via Gmail SMTP. Useful for status reports or notifications to the team.",
      inputSchema: z.object({
        to: z.string().email().describe("Recipient email address"),
        subject: z.string().min(1).describe("Email subject"),
        body: z.string().min(1).describe("Email body (plain text)"),
      }),
      execute: async (args: { to: string; subject: string; body: string }) => {
        try {
          const creds = getCredentials();
          const nodemailer = await import("nodemailer");

          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: creds,
          });

          const info = await transporter.sendMail({
            from: creds.user,
            to: args.to,
            subject: args.subject,
            text: args.body,
          });

          return {
            ok: true,
            messageId: info.messageId,
            summary: `Email sent to ${args.to}: "${args.subject}"`,
          };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            summary: "Send failed",
          };
        }
      },
    },
  };
}
