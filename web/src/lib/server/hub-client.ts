/**
 * Hub Client - Connects to the Viber Playground/Hub server
 *
 * The Viber Board delegates viber management to the hub server,
 * which handles WebSocket connections from viber daemons.
 */

const HUB_URL = process.env.VIBER_HUB_URL || "http://localhost:6007";

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
  /**
   * Get all connected vibers from the hub
   */
  async getVibers(): Promise<{ connected: boolean; vibers: ConnectedViber[] }> {
    try {
      const response = await fetch(`${HUB_URL}/api/vibers`);
      if (!response.ok) {
        throw new Error(`Hub returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get vibers:", error);
      return { connected: false, vibers: [] };
    }
  },

  /**
   * Submit a task to a viber via the hub (optionally with full chat history for context)
   */
  async submitTask(
    goal: string,
    viberId?: string,
    messages?: { role: string; content: string }[],
  ): Promise<{ taskId: string } | null> {
    try {
      const response = await fetch(`${HUB_URL}/api/vibers`, {
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

  /**
   * Get all tasks from the hub
   */
  async getTasks(): Promise<{ tasks: HubTask[] }> {
    try {
      const response = await fetch(`${HUB_URL}/api/tasks`);
      if (!response.ok) {
        throw new Error(`Hub returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get tasks:", error);
      return { tasks: [] };
    }
  },

  /**
   * Get a specific task from the hub
   */
  async getTask(taskId: string): Promise<HubTask | null> {
    try {
      const response = await fetch(`${HUB_URL}/api/tasks/${taskId}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get task:", error);
      return null;
    }
  },

  /**
   * Stop a running task on the viber via the hub
   */
  async stopTask(taskId: string): Promise<boolean> {
    try {
      const response = await fetch(`${HUB_URL}/api/tasks/${taskId}/stop`, {
        method: "POST",
      });
      return response.ok;
    } catch (error) {
      console.error("[HubClient] Failed to stop task:", error);
      return false;
    }
  },

  /**
   * Check hub health
   */
  async checkHealth(): Promise<{ status: string; vibers: number } | null> {
    try {
      const response = await fetch(`${HUB_URL}/health`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  },
};
