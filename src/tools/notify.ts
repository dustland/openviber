/**
 * Notify Tool - Send notifications to user
 *
 * Channels:
 * 1. Log file (~/.openviber/notifications.log) — always
 * 2. JSON file (~/.openviber/notifications.json) — for web UI polling
 * 3. macOS native notification (osascript) — if on macOS
 * 4. Console log — always
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import { execSync } from "child_process";

function getNotificationsDir(): string {
    return path.join(homedir(), ".openviber");
}

function getLogPath(): string {
    return path.join(getNotificationsDir(), "notifications.log");
}

function getJsonPath(): string {
    return path.join(getNotificationsDir(), "notifications.json");
}

interface Notification {
    id: string;
    timestamp: string;
    title?: string;
    message: string;
    priority: "low" | "normal" | "high";
    read: boolean;
}

/**
 * Send a macOS native notification via osascript.
 */
function sendMacNotification(title: string, message: string): boolean {
    if (process.platform !== "darwin") return false;
    try {
        const safeTitle = title.replace(/"/g, '\\"');
        const safeMsg = message.replace(/"/g, '\\"').slice(0, 200);
        execSync(
            `osascript -e 'display notification "${safeMsg}" with title "OpenViber" subtitle "${safeTitle}"'`,
            { encoding: "utf8", stdio: "pipe", timeout: 5000 },
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Append notification to JSON file (array of notifications).
 */
async function appendToJson(notification: Notification): Promise<void> {
    const jsonPath = getJsonPath();
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });

    let notifications: Notification[] = [];
    try {
        const raw = await fs.readFile(jsonPath, "utf8");
        notifications = JSON.parse(raw);
    } catch {
        // File doesn't exist or is invalid — start fresh
    }

    notifications.push(notification);

    // Keep only the last 100 notifications
    if (notifications.length > 100) {
        notifications = notifications.slice(-100);
    }

    await fs.writeFile(jsonPath, JSON.stringify(notifications, null, 2), "utf8");
}

export const notifyTool = {
    description:
        "Send a notification to the user. Sends via macOS native notification, logs to file, and stores in JSON for the web UI. Use after completing an autonomous task to inform the human of results.",
    inputSchema: z.object({
        message: z.string().describe("The notification message to send"),
        title: z
            .string()
            .optional()
            .describe("Optional title/subject for the notification"),
        priority: z
            .enum(["low", "normal", "high"])
            .optional()
            .describe("Priority level (default: normal)"),
    }),
    execute: async (args: {
        message: string;
        title?: string;
        priority?: "low" | "normal" | "high";
    }) => {
        const { message, title, priority = "normal" } = args;
        const timestamp = new Date().toISOString();
        const logPath = getLogPath();
        const channels: string[] = [];

        // Ensure parent directory exists
        await fs.mkdir(path.dirname(logPath), { recursive: true });

        // 1. Log to file
        const logLine = `[${timestamp}] [${priority.toUpperCase()}] ${title ? title + ": " : ""}${message}\n`;
        await fs.appendFile(logPath, logLine, "utf8");
        channels.push("log");

        // 2. JSON for web UI
        const notification: Notification = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp,
            title,
            message,
            priority,
            read: false,
        };
        await appendToJson(notification);
        channels.push("json");

        // 3. macOS native notification
        const macSent = sendMacNotification(title || "Notification", message);
        if (macSent) channels.push("macos");

        // 4. Console log
        console.log(
            `📬 Notification: ${title ? title + " - " : ""}${message}`,
        );
        channels.push("console");

        return {
            sent: true,
            channels,
            notificationId: notification.id,
            timestamp,
            message: `Notification sent via: ${channels.join(", ")}`,
        };
    },
};

export const listNotificationsTool = {
    description: "List recent notifications that have been sent",
    inputSchema: z.object({
        limit: z
            .number()
            .optional()
            .describe("Number of notifications to show (default: 10)"),
        unreadOnly: z
            .boolean()
            .optional()
            .describe("If true, show only unread notifications"),
    }),
    execute: async (args: { limit?: number; unreadOnly?: boolean }) => {
        const { limit = 10, unreadOnly = false } = args;
        const jsonPath = getJsonPath();

        try {
            const raw = await fs.readFile(jsonPath, "utf8");
            let notifications: Notification[] = JSON.parse(raw);

            if (unreadOnly) {
                notifications = notifications.filter((n) => !n.read);
            }

            notifications = notifications.slice(-limit);

            return {
                notifications,
                count: notifications.length,
            };
        } catch {
            return {
                notifications: [],
                count: 0,
                message: "No notifications found",
            };
        }
    },
};

// Export all notify tools
export const notifyTools: Record<string, any> = {
    notify: notifyTool,
    list_notifications: listNotificationsTool,
};
