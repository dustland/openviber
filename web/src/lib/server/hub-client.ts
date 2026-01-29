/**
 * Hub Client - Connects to the Viber Playground/Hub server
 *
 * The cockpit delegates viber management to the hub server,
 * which handles WebSocket connections from viber daemons.
 */

const HUB_URL = process.env.VIBER_HUB_URL || "http://localhost:6007";

export interface ConnectedViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  connectedAt: string;
}

export interface HubTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error";
  createdAt: string;
  result?: unknown;
  error?: string;
  eventCount?: number;
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
   * Submit a task to a viber via the hub
   */
  async submitTask(
    goal: string,
    viberId?: string,
  ): Promise<{ taskId: string } | null> {
    try {
      const response = await fetch(`${HUB_URL}/api/vibers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, viberId }),
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
