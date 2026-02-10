/**
 * Gmail Skill — Native Google API integration
 *
 * Uses the googleapis library with OAuth2 tokens to provide Gmail
 * search, read, send, and modify capabilities. Tokens are injected
 * via the tool execution context from the daemon config.
 */

import { z } from "zod";
import type { CoreTool } from "../../core/tool";

const MAX_RESULTS = 100;
const MAX_BODY_CHARS = 8000;

// ==================== Helpers ====================

interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
}

/**
 * Get a Gmail client using tokens from the context.
 * Lazily imports googleapis to avoid bundling issues when the skill
 * is loaded but Google OAuth is not configured.
 */
async function getGmailClient(tokens: GoogleOAuthTokens) {
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken || undefined,
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function extractTokens(context?: any): GoogleOAuthTokens {
  const google = context?.oauthTokens?.google;
  if (!google?.accessToken) {
    throw new Error(
      "Gmail OAuth tokens not available. Connect your Google account in Settings > Integrations.",
    );
  }
  return google;
}

/**
 * Decode a base64url-encoded message body part.
 */
function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/**
 * Extract plain text body from a Gmail message payload.
 */
function extractBody(payload: any): string {
  if (!payload) return "";

  // Direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — look for text/plain first, then text/html
  if (payload.parts && Array.isArray(payload.parts)) {
    // First pass: text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Second pass: text/html (strip tags)
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]+>/g, "");
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

/**
 * Get a header value from a Gmail message payload.
 */
function getHeader(payload: any, name: string): string {
  if (!payload?.headers) return "";
  const header = payload.headers.find(
    (h: any) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || "";
}

/**
 * Build an RFC 2822 email message for sending.
 */
function buildRawEmail(args: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  from?: string;
}): string {
  const lines: string[] = [];
  if (args.from) lines.push(`From: ${args.from}`);
  lines.push(`To: ${args.to}`);
  if (args.cc) lines.push(`Cc: ${args.cc}`);
  if (args.bcc) lines.push(`Bcc: ${args.bcc}`);
  lines.push(`Subject: ${args.subject}`);
  lines.push("Content-Type: text/plain; charset=utf-8");
  lines.push("");
  lines.push(args.body);

  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

// ==================== Tool exports ====================

export function getTools(): Record<string, CoreTool> {
  return {
    gmail_search: {
      description:
        "Search Gmail messages using full Gmail search syntax (same as the Gmail search bar). Returns message IDs, subjects, senders, and dates.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "Gmail search query (e.g. 'is:unread', 'from:alice@example.com newer_than:7d', 'subject:deploy')",
          ),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .optional()
          .default(20)
          .describe("Maximum number of messages to return (default: 20)"),
      }),
      execute: async (
        args: { query: string; maxResults?: number },
        context?: any,
      ) => {
        try {
          const tokens = extractTokens(context);
          const gmail = await getGmailClient(tokens);

          const listRes = await gmail.users.messages.list({
            userId: "me",
            q: args.query,
            maxResults: args.maxResults ?? 20,
          });

          const messageIds = listRes.data.messages || [];
          if (messageIds.length === 0) {
            return {
              ok: true,
              count: 0,
              messages: [],
              summary: `No messages found for "${args.query}"`,
            };
          }

          // Fetch metadata for each message
          const messages = await Promise.all(
            messageIds.map(async (msg: any) => {
              const detail = await gmail.users.messages.get({
                userId: "me",
                id: msg.id,
                format: "metadata",
                metadataHeaders: ["From", "Subject", "Date"],
              });
              const payload = detail.data.payload;
              return {
                id: msg.id,
                threadId: msg.threadId,
                from: getHeader(payload, "From"),
                subject: getHeader(payload, "Subject"),
                date: getHeader(payload, "Date"),
                snippet: detail.data.snippet || "",
                labelIds: detail.data.labelIds || [],
              };
            }),
          );

          return {
            ok: true,
            count: messages.length,
            messages,
            summary: `Found ${messages.length} message(s) for "${args.query}"`,
          };
        } catch (err: any) {
          return {
            ok: false,
            count: 0,
            messages: [],
            error: err?.message || String(err),
            summary: "Search failed",
          };
        }
      },
    },

    gmail_read: {
      description:
        "Read the full body of a Gmail message by its message ID. Get IDs from gmail_search results.",
      inputSchema: z.object({
        messageId: z
          .string()
          .min(1)
          .describe("Gmail message ID from gmail_search results"),
      }),
      execute: async (args: { messageId: string }, context?: any) => {
        try {
          const tokens = extractTokens(context);
          const gmail = await getGmailClient(tokens);

          const detail = await gmail.users.messages.get({
            userId: "me",
            id: args.messageId,
            format: "full",
          });

          const payload = detail.data.payload;
          let body = extractBody(payload);
          if (body.length > MAX_BODY_CHARS) {
            body =
              body.slice(0, MAX_BODY_CHARS) +
              `\n...[truncated ${body.length - MAX_BODY_CHARS} chars]`;
          }

          const email = {
            id: detail.data.id,
            threadId: detail.data.threadId,
            from: getHeader(payload, "From"),
            to: getHeader(payload, "To"),
            subject: getHeader(payload, "Subject"),
            date: getHeader(payload, "Date"),
            body: body.trim(),
            labelIds: detail.data.labelIds || [],
          };

          return {
            ok: true,
            email,
            summary: `Read email: "${email.subject}" from ${email.from}`,
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
        "Send an email via Gmail. Composes and sends a plain text email.",
      inputSchema: z.object({
        to: z.string().min(1).describe("Recipient email address"),
        subject: z.string().min(1).describe("Email subject line"),
        body: z.string().min(1).describe("Email body (plain text)"),
        cc: z.string().optional().describe("CC recipient email address"),
        bcc: z.string().optional().describe("BCC recipient email address"),
      }),
      execute: async (
        args: {
          to: string;
          subject: string;
          body: string;
          cc?: string;
          bcc?: string;
        },
        context?: any,
      ) => {
        try {
          const tokens = extractTokens(context);
          const gmail = await getGmailClient(tokens);

          const raw = buildRawEmail(args);
          const sendRes = await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw },
          });

          return {
            ok: true,
            messageId: sendRes.data.id,
            threadId: sendRes.data.threadId,
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

    gmail_modify: {
      description:
        "Modify labels on a Gmail message (e.g. mark as read/unread, archive, star).",
      inputSchema: z.object({
        messageId: z
          .string()
          .min(1)
          .describe("Gmail message ID"),
        addLabels: z
          .array(z.string())
          .optional()
          .describe("Label IDs to add (e.g. ['STARRED', 'UNREAD'])"),
        removeLabels: z
          .array(z.string())
          .optional()
          .describe("Label IDs to remove (e.g. ['UNREAD', 'INBOX'])"),
      }),
      execute: async (
        args: {
          messageId: string;
          addLabels?: string[];
          removeLabels?: string[];
        },
        context?: any,
      ) => {
        try {
          const tokens = extractTokens(context);
          const gmail = await getGmailClient(tokens);

          await gmail.users.messages.modify({
            userId: "me",
            id: args.messageId,
            requestBody: {
              addLabelIds: args.addLabels || [],
              removeLabelIds: args.removeLabels || [],
            },
          });

          const actions: string[] = [];
          if (args.addLabels?.length) {
            actions.push(`added: ${args.addLabels.join(", ")}`);
          }
          if (args.removeLabels?.length) {
            actions.push(`removed: ${args.removeLabels.join(", ")}`);
          }

          return {
            ok: true,
            summary: `Modified message ${args.messageId} (${actions.join("; ")})`,
          };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            summary: "Modify failed",
          };
        }
      },
    },
  };
}
