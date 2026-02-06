/**
 * Notify Tool - Send notifications to user
 * 
 * Start simple (console/file), can expand to Slack/email/SMS later
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";

/**
 * Get notifications log path
 */
function getNotificationsPath(): string {
    return path.join(homedir(), ".openviber", "notifications.log");
}

export const notifyTool = {
    description: "Send a notification to the user. Currently logs to file; can be extended to Slack, email, SMS.",
    inputSchema: z.object({
        message: z.string().describe("The notification message to send"),
        title: z.string().optional().describe("Optional title/subject for the notification"),
        priority: z.enum(["low", "normal", "high"]).optional().describe("Priority level (default: normal)"),
    }),
    execute: async (args: { message: string; title?: string; priority?: "low" | "normal" | "high" }) => {
        const { message, title, priority = "normal" } = args;
        const timestamp = new Date().toISOString();
        const logPath = getNotificationsPath();

        // Ensure parent directory exists
        await fs.mkdir(path.dirname(logPath), { recursive: true });

        // Log to file
        const logLine = `[${timestamp}] [${priority.toUpperCase()}] ${title ? title + ": " : ""}${message}\n`;
        await fs.appendFile(logPath, logLine, "utf8");

        // Also console log for immediate visibility
        console.log(`📬 Notification: ${title ? title + " - " : ""}${message}`);

        return {
            sent: true,
            channel: "log",
            timestamp,
            logPath,
            message: `Notification logged. View with: cat ${logPath}`,
            availableChannels: ["log", "console"],
            futureChannels: ["slack", "email", "sms", "telegram"]
        };
    }
};

export const listNotificationsTool = {
    description: "List recent notifications that have been sent",
    inputSchema: z.object({
        limit: z.number().optional().describe("Number of notifications to show (default: 10)")
    }),
    execute: async (args: { limit?: number }) => {
        const { limit = 10 } = args;
        const logPath = getNotificationsPath();

        try {
            const content = await fs.readFile(logPath, "utf8");
            const lines = content.trim().split("\n").slice(-limit);
            return {
                notifications: lines,
                count: lines.length,
                logPath
            };
        } catch {
            return {
                notifications: [],
                count: 0,
                message: "No notifications found"
            };
        }
    }
};

// Export all notify tools
export const notifyTools: Record<string, any> = {
    notify: notifyTool,
    list_notifications: listNotificationsTool,
};
