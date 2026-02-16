/**
 * Gateway type definitions
 */

import type { WebSocket } from "ws";
import type {
  MachineResourceStatus,
  ViberRunningStatus,
  ViberSystemStatus,
} from "../daemon/telemetry";

// Re-export for convenience
export type { ViberSystemStatus };

export interface GatewayConfig {
  port: number;
  /** Web API base URL for persisting config sync state (optional) */
  webApiUrl?: string;
  /** API token for authenticating with web API (optional) */
  webApiToken?: string;
}

export interface JobEntry {
  name: string;
  schedule: string;
  prompt: string;
  description?: string;
  model?: string;
  viberId?: string;
}

export interface ConnectedViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
    status: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
    healthSummary?: string;
    checks?: Array<{
      id: string;
      label: string;
      ok: boolean;
      required?: boolean;
      message?: string;
      hint?: string;
      actionType?: "env" | "oauth" | "binary" | "auth_cli" | "manual";
    }>;
  }>;
  ws: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  runningVibers: string[];
  /** Jobs currently loaded on this viber's scheduler. */
  jobs: JobEntry[];
  /** Latest machine resource status from heartbeat */
  machineStatus?: MachineResourceStatus;
  /** Latest viber running status from heartbeat */
  viberStatus?: ViberRunningStatus;
  /** Pending status:request resolver (for on-demand status requests) */
  pendingStatusResolvers?: Array<(status: ViberSystemStatus) => void>;
}

export interface TaskEvent {
  at: string;
  event: any;
}

export interface SystemEvent {
  at: string;
  category: "system";
  component: string;
  level: "info" | "warn" | "error";
  message: string;
  viberId?: string;
  viberName?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskProgressEnvelope {
  eventId: string;
  sequence: number;
  taskId: string;
  conversationId: string;
  createdAt: string;
  model?: string;
  event: {
    kind?: string;
    delta?: string;
    [key: string]: unknown;
  };
}

export interface GatewayTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  events: TaskEvent[];
  partialText?: string;
  streamChunks: string[];
  streamBytes: number;
}
