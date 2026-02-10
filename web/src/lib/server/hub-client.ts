/**
 * Hub Client - Connects to the Viber Hub server
 *
 * The OpenViber web app delegates node/viber management to the hub server,
 * which handles WebSocket connections from node daemons.
 *
 * Terminology:
 *   - Node: a machine running the daemon process (connected via WebSocket)
 *   - Viber: a task/conversation session running on a node
 */

import { env } from "$env/dynamic/private";

const HUB_URL = env.VIBER_HUB_URL || "http://localhost:6007";
const HUB_API_TOKEN = env.VIBER_HUB_API_TOKEN;
const ENFORCE_SECURE_HUB = env.VIBER_HUB_SECURE === "true";

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

export interface NodeSkillInfo {
  id: string;
  name: string;
  description: string;
}

/** Summary machine resource metrics (from heartbeat) */
export interface NodeMachineMetrics {
  hostname: string;
  arch: string;
  systemUptimeSeconds: number;
  cpu: {
    cores: number;
    averageUsage: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    usagePercent: number;
  };
  loadAverage: [number, number, number];
}

/** Summary viber metrics (from heartbeat) */
export interface NodeViberMetrics {
  daemonUptimeSeconds: number;
  runningTaskCount: number;
  totalTasksExecuted: number;
  processMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
}

/** A connected node (daemon) on the hub */
export interface ConnectedNode {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  connectedAt: string;
  lastHeartbeat: string;
  skills?: NodeSkillInfo[];
  runningVibers: string[];
  /** Machine resource metrics (from heartbeat) */
  machine?: NodeMachineMetrics;
  /** Viber daemon metrics (from heartbeat) */
  viber?: NodeViberMetrics;
}

/** Full machine resource status snapshot (from node status request) */
export interface MachineResourceStatus {
  hostname: string;
  platform: string;
  osRelease: string;
  arch: string;
  systemUptimeSeconds: number;
  cpu: {
    cores: number;
    model: string;
    speedMHz: number;
    coreUsages: number[];
    averageUsage: number;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usagePercent: number;
  };
  disks: {
    mount: string;
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usagePercent: number;
  }[];
  loadAverage: [number, number, number];
  network: {
    name: string;
    ipv4?: string;
    ipv6?: string;
    mac?: string;
    internal: boolean;
  }[];
  collectedAt: string;
}

/** Full viber running status (from node status request) */
export interface ViberRunningStatus {
  viberId: string;
  viberName: string;
  version: string;
  connected: boolean;
  daemonUptimeSeconds: number;
  processMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  runningTaskCount: number;
  runningTasks: {
    taskId: string;
    goal: string;
    model?: string;
    isRunning: boolean;
    messageCount: number;
  }[];
  skills: string[];
  capabilities: string[];
  skillHealth?: SkillHealthReport;
  totalTasksExecuted: number;
  lastHeartbeatAt?: string;
  collectedAt: string;
}

export interface SkillHealthCheck {
  id: string;
  label: string;
  ok: boolean;
  required?: boolean;
  message?: string;
  hint?: string;
}

export interface SkillHealthResult {
  id: string;
  name: string;
  status: string;
  available: boolean;
  checks: SkillHealthCheck[];
  summary: string;
}

export interface SkillHealthReport {
  generatedAt: string;
  skills: SkillHealthResult[];
}

/** Full node observability status (from node status request) */
export interface NodeObservabilityStatus {
  machine: MachineResourceStatus;
  viber: ViberRunningStatus;
}

/** Environment context passed to viber for project awareness */
export interface ViberEnvironmentContext {
  name: string;
  repoUrl?: string;
  repoOrg?: string;
  repoName?: string;
  repoBranch?: string;
  variables?: { key: string; value: string }[];
}

/** A viber session on the hub */
export interface HubViber {
  id: string;
  nodeId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  createdAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
  eventCount?: number;
  partialText?: string;
  nodeName?: string;
  isNodeConnected?: boolean;
}

export const hubClient = {
  /** List connected nodes (daemons) from the hub */
  async getNodes(): Promise<{ connected: boolean; nodes: ConnectedNode[] }> {
    try {
      const response = await hubFetch("/api/nodes");
      if (!response.ok) {
        throw new Error(`Hub returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get nodes:", error);
      return { connected: false, nodes: [] };
    }
  },

  /** List viber sessions from the hub */
  async getVibers(): Promise<{ vibers: HubViber[] }> {
    try {
      const response = await hubFetch("/api/vibers");
      if (!response.ok) {
        throw new Error(`Hub returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get vibers:", error);
      return { vibers: [] };
    }
  },

  /** Create a new viber on a node */
  async createViber(
    goal: string,
    nodeId?: string,
    messages?: { role: string; content: string }[],
    environment?: ViberEnvironmentContext,
    settings?: { primaryCodingCli?: string },
  ): Promise<{ viberId: string; nodeId: string } | null> {
    try {
      const response = await hubFetch("/api/vibers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, nodeId, messages, environment, settings }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Hub returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to create viber:", error);
      return null;
    }
  },

  /** Get a specific viber by ID */
  async getViber(viberId: string): Promise<HubViber | null> {
    try {
      const response = await hubFetch(`/api/vibers/${viberId}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get viber:", error);
      return null;
    }
  },

  /** Send a message to an existing viber */
  async sendMessage(
    viberId: string,
    messages: { role: string; content: string }[],
    goal?: string,
    environment?: ViberEnvironmentContext,
    settings?: { primaryCodingCli?: string },
  ): Promise<{ viberId: string; nodeId: string } | null> {
    try {
      const response = await hubFetch(`/api/vibers/${viberId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, goal, environment, settings }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Hub returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to send message:", error);
      return null;
    }
  },

  /** Stop a viber */
  async stopViber(viberId: string): Promise<boolean> {
    try {
      const response = await hubFetch(`/api/vibers/${viberId}/stop`, {
        method: "POST",
      });
      return response.ok;
    } catch (error) {
      console.error("[HubClient] Failed to stop viber:", error);
      return false;
    }
  },

  /** Push a job config to a node. The node writes it locally and reloads its scheduler. */
  async pushJobToNode(
    nodeId: string,
    job: {
      name: string;
      schedule: string;
      prompt: string;
      description?: string;
      model?: string;
      nodeId?: string;
    },
  ): Promise<boolean> {
    try {
      const response = await hubFetch(`/api/nodes/${encodeURIComponent(nodeId)}/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      });
      return response.ok;
    } catch (error) {
      console.error("[HubClient] Failed to push job to node:", error);
      return false;
    }
  },

  /** Fetch jobs reported by all connected nodes from the hub. */
  async getNodeJobs(): Promise<{
    nodeJobs: Array<{
      nodeId: string;
      nodeName: string;
      jobs: Array<{
        name: string;
        description?: string;
        schedule: string;
        prompt: string;
        model?: string;
        nodeId?: string;
      }>;
    }>;
  }> {
    try {
      const response = await hubFetch("/api/jobs");
      if (!response.ok) {
        return { nodeJobs: [] };
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get node jobs:", error);
      return { nodeJobs: [] };
    }
  },

  /** Get detailed observability status for a specific node */
  async getNodeStatus(nodeId: string): Promise<{
    nodeId: string;
    status: NodeObservabilityStatus | null;
    source: string;
  } | null> {
    try {
      const response = await hubFetch(`/api/nodes/${encodeURIComponent(nodeId)}/status`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[HubClient] Failed to get node status:", error);
      return null;
    }
  },

  async checkHealth(): Promise<{
    status: string;
    nodes: number;
    healthyNodes: number;
    vibers: number;
    nodesSummary?: {
      id: string;
      name: string;
      healthy: boolean;
      heartbeatAgeMs: number;
      runningVibers: number;
      cpu?: number;
      memoryUsagePercent?: number;
    }[];
  } | null> {
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
