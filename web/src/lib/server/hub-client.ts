/**
 * Hub Client - Connects to the Viber Playground/Hub server
 *
 * The Viber Board delegates viber management to the hub server,
 * which handles WebSocket connections from viber daemons.
 */

const HUB_URL = process.env.VIBER_HUB_URL || "http://localhost:6007";
const HUB_API_TOKEN = process.env.VIBER_HUB_API_TOKEN;
const ENFORCE_SECURE_HUB = process.env.VIBER_HUB_SECURE === "true";

function getHubBaseUrl() {
  const parsed = new URL(HUB_URL);
  if (ENFORCE_SECURE_HUB && parsed.protocol !== "https:") {
    throw new Error("VIBER_HUB_SECURE=true requires VIBER_HUB_URL to use https.");
  }
  return parsed;
}

function hubHeaders() {
  const headers: Record<string, string> = {};
  if (HUB_API_TOKEN) {
    headers.Authorization = `Bearer ${HUB_API_TOKEN}`;
  }
  return headers;
}

async function hubFetch(path: string, init: RequestInit = {}) {
  const base = getHubBaseUrl();
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: {
      ...hubHeaders(),
      ...(init.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {}),
    },
  });
  return response;
}

export interface ViberSkillInfo {
  id: string;
  name: string;
  description: string;
}

export interface ConnectedViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  connectedAt: string;
  skills?: ViberSkillInfo[];
}

export interface HubTaskEvent {
  at: string;
  event: unknown;
}

export interface HubTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  createdAt: string;
  result?: unknown;
  error?: string;
  eventCount?: number;
  events?: HubTaskEvent[];
  partialText?: string;
}

export const hubClient = {
  async getVibers(): Promise<{ connected: boolean; vibers: ConnectedViber[] }> {
    try {
      const response = await hubFetch("/api/vibers");
      if (!response.ok) {
        throw new Error(`Hub returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get vibers:", error);
      return { connected: false, vibers: [] };
    }
  },

  async submitTask(
    goal: string,
    viberId?: string,
    messages?: { role: string; content: string }[],
  ): Promise<{ taskId: string } | null> {
    try {
      const response = await hubFetch("/api/vibers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, viberId, messages }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Hub returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to submit task:", error);
      return null;
    }
  },

  async getTasks(): Promise<{ tasks: HubTask[] }> {
    try {
      const response = await hubFetch("/api/tasks");
      if (!response.ok) {
        throw new Error(`Hub returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get tasks:", error);
      return { tasks: [] };
    }
  },

  async getTask(taskId: string): Promise<HubTask | null> {
    try {
      const response = await hubFetch(`/api/tasks/${taskId}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get task:", error);
      return null;
    }
  },

  async stopTask(taskId: string): Promise<boolean> {
    try {
      const response = await hubFetch(`/api/tasks/${taskId}/stop`, {
        method: "POST",
      });
      return response.ok;
    } catch (error) {
      console.error("[HubClient] Failed to stop task:", error);
      return false;
    }
  },

  async checkHealth(): Promise<{ status: string; vibers: number } | null> {
    try {
      const response = await hubFetch("/health");
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  },
};
