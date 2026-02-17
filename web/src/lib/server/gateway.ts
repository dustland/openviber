/**
 * Gateway Client - Connects to the OpenViber gateway
 *
 * The OpenViber web app (Viber Board) delegates viber management to the gateway,
 * which handles WebSocket connections from viber daemons.
 *
 * Terminology:
 *   - Viber: a machine running the daemon process (connected via WebSocket)
 *   - Task: a task/conversation session running on a viber
 */

import { env } from "$env/dynamic/private";

// VIBER_GATEWAY_* with deprecated VIBER_BOARD_* and VIBER_HUB_* fallbacks
const GATEWAY_URL = env.VIBER_GATEWAY_URL || env.VIBER_BOARD_URL || env.VIBER_HUB_URL || "http://localhost:6009";
const GATEWAY_API_TOKEN = env.VIBER_GATEWAY_API_TOKEN || env.VIBER_BOARD_API_TOKEN || env.VIBER_HUB_API_TOKEN;
const ENFORCE_SECURE_GATEWAY = (env.VIBER_GATEWAY_SECURE || env.VIBER_BOARD_SECURE || env.VIBER_HUB_SECURE) === "true";

function getGatewayBaseUrl() {
  const parsed = new URL(GATEWAY_URL);
  if (ENFORCE_SECURE_GATEWAY && parsed.protocol !== "https:") {
    throw new Error("VIBER_GATEWAY_SECURE=true requires VIBER_GATEWAY_URL to use https.");
  }
  return parsed;
}

function gatewayHeaders() {
  const headers: Record<string, string> = {};
  if (GATEWAY_API_TOKEN) {
    headers.Authorization = `Bearer ${GATEWAY_API_TOKEN}`;
  }
  return headers;
}

async function gatewayFetch(path: string, init: RequestInit = {}) {
  const base = getGatewayBaseUrl();
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: {
      ...gatewayHeaders(),
      ...(init.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {}),
    },
  });
  return response;
}

export interface ViberSkillInfo {
  id: string;
  name: string;
  description: string;
  /** Whether this skill is runnable on the viber */
  available: boolean;
  /** Health check status */
  status: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
  /** Human-readable summary (e.g. "Missing: gh CLI") */
  healthSummary?: string;
  /** Optional detailed health checks reported by viber */
  checks?: Array<{
    id: string;
    label: string;
    ok: boolean;
    required?: boolean;
    message?: string;
    hint?: string;
    actionType?: string;
  }>;
}

/** Summary machine resource metrics (from heartbeat) */
export interface ViberMachineMetrics {
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
export interface ViberDaemonMetrics {
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

/** A connected viber (daemon) on the gateway */
export interface ConnectedViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  connectedAt: string;
  lastHeartbeat: string;
  skills?: ViberSkillInfo[];
  runningVibers: string[];
  /** Machine resource metrics (from heartbeat) */
  machine?: ViberMachineMetrics;
  /** Viber daemon metrics (from heartbeat) */
  viber?: ViberDaemonMetrics;
}

/** Full machine resource status snapshot (from viber status request) */
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

/** Full viber running status (from viber status request) */
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

/** Full viber observability status (from viber status request) */
export interface ViberObservabilityStatus {
  machine: MachineResourceStatus;
  viber: ViberRunningStatus;
}

export interface ViberSkillProvisionResponse {
  type?: "skill:provision-result";
  requestId: string;
  skillId: string;
  ok: boolean;
  ready: boolean;
  before?: SkillHealthResult;
  after?: SkillHealthResult;
  auth?: {
    required: boolean;
    ready: boolean;
    command?: string;
    message?: string;
  };
  installLog?: Array<{
    checkId: string;
    command: string;
    ok: boolean;
    output?: string;
  }>;
  error?: string;
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

/** A viber session on the gateway */
export interface GatewayViber {
  id: string;
  userId?: string | null;
  viberId: string | null;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  archivedAt?: string | null;
  environmentId?: string | null;
  result?: unknown;
  error?: string;
  eventCount?: number;
  partialText?: string;
  viberName?: string | null;
  isConnected?: boolean;
}

/** An event from the gateway's unified event stream */
export interface GatewayEvent {
  at: string;
  category: "activity" | "system";
  // Activity event fields
  viberId?: string;
  goal?: string;
  viberStatus?: string;
  event?: Record<string, unknown>;
  // System event fields
  component?: string;
  level?: "info" | "warn" | "error";
  message?: string;
  viberName?: string;
  metadata?: Record<string, unknown>;
}

export const gatewayClient = {
  /** List connected vibers (daemons) from the gateway */
  async getVibers(): Promise<{ connected: boolean; vibers: ConnectedViber[] }> {
    try {
      const response = await gatewayFetch("/api/vibers");
      if (!response.ok) {
        throw new Error(`Gateway returned ${response.status}`);
      }
      const data = await response.json();
      // Gateway returns { connected, vibers }
      return { connected: data.connected, vibers: data.vibers ?? data.nodes ?? [] };
    } catch (error) {
      console.error("[GatewayClient] Failed to get vibers:", error);
      return { connected: false, vibers: [] };
    }
  },

  /** List task sessions from the gateway. */
  async getTasks(options?: {
    userId?: string;
    includeArchived?: boolean;
  }): Promise<{ tasks: GatewayViber[] }> {
    try {
      const params = new URLSearchParams();
      if (options?.userId) {
        params.set("userId", options.userId);
      }
      if (options?.includeArchived) {
        params.set("includeArchived", "true");
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      const response = await gatewayFetch(`/api/tasks${suffix}`);
      if (!response.ok) {
        throw new Error(`Gateway returned ${response.status}`);
      }
      const data = await response.json();
      return { tasks: data.tasks ?? data.vibers ?? [] };
    } catch (error) {
      console.error("[GatewayClient] Failed to get tasks:", error);
      return { tasks: [] };
    }
  },

  /** Create a new task on a viber */
  async createTask(
    goal: string,
    viberId?: string,
    messages?: { role: string; content: string }[],
    environment?: ViberEnvironmentContext,
    settings?: {
      primaryCodingCli?: string;
      channelIds?: string[];
      proxyUrl?: string;
      proxyEnabled?: boolean;
      skills?: string[];
    },
    oauthTokens?: Record<string, { accessToken: string; refreshToken?: string | null }>,
    model?: string,
    metadata?: {
      userId?: string;
      environmentId?: string | null;
      title?: string;
      config?: Record<string, unknown>;
    },
  ): Promise<{ viberId: string; taskId?: string } | null> {
    try {
      const response = await gatewayFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          viberId,
          messages,
          environment,
          settings,
          oauthTokens,
          model,
          metadata,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const msg = body.error || `Gateway returned ${response.status}`;
        const err = new Error(msg) as Error & { statusCode?: number; gatewayError?: string };
        err.statusCode = response.status;
        err.gatewayError = body.error;
        throw err;
      }

      const data = await response.json();
      const taskId = data.taskId ?? data.viberId;
      return { viberId: taskId, taskId };
    } catch (error) {
      console.error("[GatewayClient] Failed to create task:", error);
      throw error;
    }
  },

  /** Get a specific task by ID. */
  async getTask(taskId: string, userId?: string): Promise<GatewayViber | null> {
    try {
      const params = new URLSearchParams();
      if (userId) {
        params.set("userId", userId);
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      const response = await gatewayFetch(`/api/tasks/${taskId}${suffix}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[GatewayClient] Failed to get task:", error);
      return null;
    }
  },

  /** Send a message to an existing task. */
  async sendMessage(
    taskId: string,
    messages: { role: string; content: string }[],
    goal?: string,
    environment?: ViberEnvironmentContext,
    settings?: {
      primaryCodingCli?: string;
      proxyUrl?: string;
      proxyEnabled?: boolean;
      skills?: string[];
    },
    oauthTokens?: Record<string, { accessToken: string; refreshToken?: string | null }>,
    model?: string,
  ): Promise<{ viberId: string; taskId?: string } | null> {
    try {
      const response = await gatewayFetch(`/api/tasks/${taskId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, goal, environment, settings, oauthTokens, model }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const msg = body.error || `Gateway returned ${response.status}`;
        const err = new Error(msg) as Error & { statusCode?: number; gatewayError?: string };
        err.statusCode = response.status;
        err.gatewayError = body.error;
        throw err;
      }

      const data = await response.json();
      const resolvedTaskId = data.taskId ?? data.viberId;
      return { viberId: resolvedTaskId, taskId: resolvedTaskId };
    } catch (error) {
      console.error("[GatewayClient] Failed to send message:", error);
      throw error;
    }
  },

  /** Stop a running task. */
  async stopTask(taskId: string): Promise<boolean> {
    try {
      const response = await gatewayFetch(`/api/tasks/${taskId}/stop`, {
        method: "POST",
      });
      return response.ok;
    } catch (error) {
      console.error("[GatewayClient] Failed to stop task:", error);
      return false;
    }
  },

  /** Archive a task. */
  async archiveTask(taskId: string, userId?: string): Promise<boolean> {
    try {
      const response = await gatewayFetch(`/api/tasks/${taskId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      return response.ok;
    } catch (error) {
      console.error("[GatewayClient] Failed to archive task:", error);
      return false;
    }
  },

  /** Restore an archived task. */
  async restoreTask(taskId: string): Promise<boolean> {
    try {
      const response = await gatewayFetch(`/api/tasks/${taskId}/archive`, {
        method: "DELETE",
      });
      return response.ok;
    } catch (error) {
      console.error("[GatewayClient] Failed to restore task:", error);
      return false;
    }
  },

  /** Permanently delete a task. */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      const response = await gatewayFetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      return response.ok;
    } catch (error) {
      console.error("[GatewayClient] Failed to delete task:", error);
      return false;
    }
  },

  /** Push a job config to a viber. The viber writes it locally and reloads its scheduler. */
  async pushJobToViber(
    viberId: string,
    job: {
      name: string;
      schedule: string;
      prompt: string;
      description?: string;
      model?: string;
      viberId?: string;
    },
  ): Promise<boolean> {
    try {
      const response = await gatewayFetch(`/api/vibers/${encodeURIComponent(viberId)}/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      });
      return response.ok;
    } catch (error) {
      console.error("[GatewayClient] Failed to push job to viber:", error);
      return false;
    }
  },

  /** Fetch jobs reported by all connected vibers from the hub. */
  async getViberJobs(): Promise<{
    viberJobs: Array<{
      viberId: string;
      viberName: string;
      jobs: Array<{
        name: string;
        description?: string;
        schedule: string;
        prompt: string;
        model?: string;
        viberId?: string;
      }>;
    }>;
  }> {
    try {
      const response = await gatewayFetch("/api/jobs");
      if (!response.ok) {
        return { viberJobs: [] };
      }
      // Gateway returns { nodeJobs } — accept both old and new keys
      const data = await response.json();
      return { viberJobs: data.viberJobs ?? data.nodeJobs ?? [] };
    } catch (error) {
      console.error("[GatewayClient] Failed to get viber jobs:", error);
      return { viberJobs: [] };
    }
  },

  /** Get detailed observability status for a specific viber */
  async getViberStatus(viberId: string): Promise<{
    viberId: string;
    status: ViberObservabilityStatus | null;
    source: string;
  } | null> {
    try {
      const response = await gatewayFetch(
        `/api/vibers/${encodeURIComponent(viberId)}/status`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[GatewayClient] Failed to get viber status:", error);
      return null;
    }
  },

  /** Run deterministic skill provisioning actions on a connected viber */
  async provisionViberSkill(
    viberId: string,
    payload: {
      skillId: string;
      install?: boolean;
      authAction?: "none" | "copy" | "start";
    },
  ): Promise<ViberSkillProvisionResponse> {
    const response = await gatewayFetch(
      `/api/vibers/${encodeURIComponent(viberId)}/skills/provision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error || `Gateway returned ${response.status}`;
      throw new Error(message);
    }
    return data as ViberSkillProvisionResponse;
  },

  /** Fetch unified event stream from the hub (activity + system events) */
  async getEvents(
    limit = 200,
    since?: string,
  ): Promise<{ events: GatewayEvent[] }> {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (since) params.set("since", since);
      const response = await gatewayFetch(`/api/events?${params}`);
      if (!response.ok) {
        return { events: [] };
      }
      return await response.json();
    } catch (error) {
      console.error("[GatewayClient] Failed to get events:", error);
      return { events: [] };
    }
  },

  async checkHealth(): Promise<{
    status: string;
    vibers: number;
    healthyVibers: number;
    tasks: number;
    vibersSummary?: {
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
      const response = await gatewayFetch("/health");
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  },

  /** Push config to a viber (triggers config:push WebSocket message) */
  async pushConfigToViber(viberId: string): Promise<boolean> {
    try {
      const response = await gatewayFetch(`/api/vibers/${encodeURIComponent(viberId)}/config-push`, {
        method: "POST",
      });
      if (!response.ok) {
        console.error(`[GatewayClient] Failed to push config to viber ${viberId}: ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`[GatewayClient] Failed to push config to viber ${viberId}:`, error);
      return false;
    }
  },
};
