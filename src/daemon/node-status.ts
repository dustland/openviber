/**
 * Node Status Collector - Machine Resource & Viber Running Status
 *
 * Collects comprehensive observability data for a viber node including:
 * - Machine resources: CPU, memory, disk, load, network
 * - Viber running status: tasks, uptime, connection health
 *
 * Uses only Node.js built-in modules (os, fs, child_process) — no extra deps.
 */

import * as os from "os";
import * as fs from "fs/promises";
import { execSync } from "child_process";
import type { SkillHealthReport } from "../skills/health";

// ==================== Types ====================

/** CPU usage snapshot (percentage-based) */
export interface CpuStatus {
  /** Number of logical CPU cores */
  cores: number;
  /** CPU model name */
  model: string;
  /** CPU speed in MHz */
  speedMHz: number;
  /** Per-core usage percentages (0-100) */
  coreUsages: number[];
  /** Average CPU usage across all cores (0-100) */
  averageUsage: number;
}

/** System memory status in bytes */
export interface MemoryStatus {
  /** Total system memory */
  totalBytes: number;
  /** Free (available) system memory */
  freeBytes: number;
  /** Used system memory */
  usedBytes: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
}

/** Disk usage for a mount point */
export interface DiskStatus {
  /** Filesystem mount point */
  mount: string;
  /** Filesystem type (e.g., ext4, apfs) */
  fsType?: string;
  /** Total disk space in bytes */
  totalBytes: number;
  /** Used disk space in bytes */
  usedBytes: number;
  /** Available disk space in bytes */
  availableBytes: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
}

/** Network interface summary */
export interface NetworkInterfaceStatus {
  /** Interface name (e.g., eth0, wlan0) */
  name: string;
  /** IPv4 address */
  ipv4?: string;
  /** IPv6 address */
  ipv6?: string;
  /** MAC address */
  mac?: string;
  /** Whether this is an internal (loopback) interface */
  internal: boolean;
}

/** Full machine resource snapshot */
export interface MachineResourceStatus {
  /** Host name */
  hostname: string;
  /** Operating system platform */
  platform: string;
  /** OS release version */
  osRelease: string;
  /** OS architecture (x64, arm64, etc.) */
  arch: string;
  /** System uptime in seconds */
  systemUptimeSeconds: number;
  /** CPU status */
  cpu: CpuStatus;
  /** System memory status */
  memory: MemoryStatus;
  /** Disk usage (primary mounts) */
  disks: DiskStatus[];
  /** System load averages (1, 5, 15 min) */
  loadAverage: [number, number, number];
  /** Active network interfaces */
  network: NetworkInterfaceStatus[];
  /** Timestamp when this snapshot was taken */
  collectedAt: string;
}

/** Information about a running task on this viber */
export interface RunningTaskInfo {
  /** Task ID */
  taskId: string;
  /** Task goal / description */
  goal: string;
  /** Model being used */
  model?: string;
  /** Whether the task is actively running LLM inference */
  isRunning: boolean;
  /** Number of messages in the conversation */
  messageCount: number;
}

/** Viber daemon running status */
export interface ViberRunningStatus {
  /** Viber daemon ID */
  viberId: string;
  /** Viber name */
  viberName: string;
  /** OpenViber version */
  version: string;
  /** Whether the viber is connected to the hub */
  connected: boolean;
  /** Daemon process uptime in seconds */
  daemonUptimeSeconds: number;
  /** Node.js process memory usage */
  processMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  /** Number of running tasks */
  runningTaskCount: number;
  /** Detailed info on running tasks */
  runningTasks: RunningTaskInfo[];
  /** Skills loaded on this viber */
  skills: string[];
  /** Capabilities enabled */
  capabilities: string[];
  /** Health status for installed skills (optional, on-demand) */
  skillHealth?: SkillHealthReport;
  /** Total tasks executed since startup */
  totalTasksExecuted: number;
  /** Timestamp of last heartbeat sent */
  lastHeartbeatAt?: string;
  /** Timestamp when this snapshot was taken */
  collectedAt: string;
}

/** Combined node observability snapshot */
export interface NodeObservabilityStatus {
  machine: MachineResourceStatus;
  viber: ViberRunningStatus;
}

/** Configuration validation result for a specific category */
export interface ConfigValidation {
  category: "llm_keys" | "oauth" | "env_secrets" | "skills" | "binary_deps";
  status: "verified" | "failed" | "unchecked";
  message?: string;
  checkedAt: string;
}

/** Configuration sync state tracking */
export interface ConfigState {
  /** Hash of current config (for versioning) */
  configVersion: string;
  /** ISO timestamp of last config pull */
  lastConfigPullAt: string;
  /** Validation results per category */
  validations: ConfigValidation[];
}

// ==================== CPU Usage Tracking ====================

let previousCpuTimes: os.CpuInfo[] | null = null;

/**
 * Calculate per-core CPU usage percentages by comparing two snapshots.
 * Returns array of per-core usage (0-100) and the average.
 */
function calculateCpuUsage(): { coreUsages: number[]; averageUsage: number } {
  const cpus = os.cpus();

  if (!previousCpuTimes) {
    previousCpuTimes = cpus;
    // Return 0 on first call since we need two snapshots
    return {
      coreUsages: cpus.map(() => 0),
      averageUsage: 0,
    };
  }

  const coreUsages: number[] = [];

  for (let i = 0; i < cpus.length; i++) {
    const prev = previousCpuTimes[i];
    const curr = cpus[i];

    if (!prev || !curr) {
      coreUsages.push(0);
      continue;
    }

    const prevTotal =
      prev.times.user +
      prev.times.nice +
      prev.times.sys +
      prev.times.idle +
      prev.times.irq;
    const currTotal =
      curr.times.user +
      curr.times.nice +
      curr.times.sys +
      curr.times.idle +
      curr.times.irq;

    const totalDiff = currTotal - prevTotal;
    const idleDiff = curr.times.idle - prev.times.idle;

    if (totalDiff === 0) {
      coreUsages.push(0);
    } else {
      const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
      coreUsages.push(Math.round(usage * 100) / 100);
    }
  }

  previousCpuTimes = cpus;

  const averageUsage =
    coreUsages.length > 0
      ? Math.round(
          (coreUsages.reduce((a, b) => a + b, 0) / coreUsages.length) * 100
        ) / 100
      : 0;

  return { coreUsages, averageUsage };
}

// ==================== Disk Usage ====================

/**
 * Collect disk usage for primary mount points.
 * Uses `df` on Linux/macOS. Returns empty array on failure.
 */
function collectDiskStatus(): DiskStatus[] {
  try {
    const output = execSync("df -kP 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    });

    const lines = output.trim().split("\n").slice(1); // Skip header
    const disks: DiskStatus[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;

      const mount = parts[5];
      // Only include real filesystems, skip tmpfs/devtmpfs/etc.
      if (
        !mount ||
        mount.startsWith("/snap") ||
        mount.startsWith("/boot") ||
        mount === "/dev" ||
        mount === "/dev/shm"
      ) {
        continue;
      }

      // Only include root "/" and home-like mounts
      if (mount === "/" || mount.startsWith("/home") || mount.startsWith("/Users") || mount === "/tmp") {
        const totalKb = parseInt(parts[1], 10);
        const usedKb = parseInt(parts[2], 10);
        const availKb = parseInt(parts[3], 10);

        if (isNaN(totalKb) || totalKb === 0) continue;

        disks.push({
          mount,
          totalBytes: totalKb * 1024,
          usedBytes: usedKb * 1024,
          availableBytes: availKb * 1024,
          usagePercent:
            Math.round(((usedKb / totalKb) * 100) * 100) / 100,
        });
      }
    }

    return disks;
  } catch {
    return [];
  }
}

// ==================== Network ====================

/**
 * Collect active (non-internal) network interface info.
 */
function collectNetworkStatus(): NetworkInterfaceStatus[] {
  const interfaces = os.networkInterfaces();
  const result: NetworkInterfaceStatus[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    const iface: NetworkInterfaceStatus = {
      name,
      internal: addrs.some((a) => a.internal) ?? false,
    };

    for (const addr of addrs) {
      if (addr.family === "IPv4") {
        iface.ipv4 = addr.address;
        iface.mac = addr.mac;
      } else if (addr.family === "IPv6" && !addr.address.startsWith("fe80")) {
        iface.ipv6 = addr.address;
      }
    }

    // Only include interfaces with at least an IPv4 address
    if (iface.ipv4) {
      result.push(iface);
    }
  }

  return result;
}

// ==================== Public API ====================

/**
 * Collect a full machine resource status snapshot.
 * Safe to call frequently (e.g., every heartbeat interval).
 */
export function collectMachineResourceStatus(): MachineResourceStatus {
  const cpus = os.cpus();
  const { coreUsages, averageUsage } = calculateCpuUsage();

  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    osRelease: os.release(),
    arch: os.arch(),
    systemUptimeSeconds: Math.round(os.uptime()),
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model ?? "unknown",
      speedMHz: cpus[0]?.speed ?? 0,
      coreUsages,
      averageUsage,
    },
    memory: {
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      usedBytes: os.totalmem() - os.freemem(),
      usagePercent:
        Math.round(
          ((os.totalmem() - os.freemem()) / os.totalmem()) * 100 * 100
        ) / 100,
    },
    disks: collectDiskStatus(),
    loadAverage: os.loadavg() as [number, number, number],
    network: collectNetworkStatus(),
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Collect viber running status.
 * Caller must provide runtime-specific data (tasks, connection state, etc.)
 */
export function collectViberRunningStatus(params: {
  viberId: string;
  viberName: string;
  version: string;
  connected: boolean;
  daemonStartTime: number;
  runningTasks: RunningTaskInfo[];
  skills: string[];
  capabilities: string[];
  skillHealth?: SkillHealthReport;
  totalTasksExecuted: number;
  lastHeartbeatAt?: string;
}): ViberRunningStatus {
  const mem = process.memoryUsage();

  return {
    viberId: params.viberId,
    viberName: params.viberName,
    version: params.version,
    connected: params.connected,
    daemonUptimeSeconds: Math.round((Date.now() - params.daemonStartTime) / 1000),
    processMemory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
    runningTaskCount: params.runningTasks.length,
    runningTasks: params.runningTasks,
    skills: params.skills,
    capabilities: params.capabilities,
    skillHealth: params.skillHealth,
    totalTasksExecuted: params.totalTasksExecuted,
    lastHeartbeatAt: params.lastHeartbeatAt,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Collect the full node observability snapshot.
 */
export function collectNodeStatus(params: {
  viberId: string;
  viberName: string;
  version: string;
  connected: boolean;
  daemonStartTime: number;
  runningTasks: RunningTaskInfo[];
  skills: string[];
  capabilities: string[];
  skillHealth?: SkillHealthReport;
  totalTasksExecuted: number;
  lastHeartbeatAt?: string;
}): NodeObservabilityStatus {
  return {
    machine: collectMachineResourceStatus(),
    viber: collectViberRunningStatus(params),
  };
}

/**
 * Collect config sync state.
 * @param configVersion - Hash/version of current config
 * @param lastConfigPullAt - ISO timestamp of last config pull
 * @param validations - Validation results from config validator
 */
export function collectConfigState(
  configVersion: string,
  lastConfigPullAt: string,
  validations: ConfigValidation[] = []
): ConfigState {
  return {
    configVersion,
    lastConfigPullAt,
    validations,
  };
}

// ==================== Formatting Helpers ====================

/**
 * Format bytes into human-readable string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Format seconds into human-readable uptime (e.g., "2d 5h 30m")
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Format a NodeObservabilityStatus into a human-readable string
 * suitable for CLI display.
 */
export function formatNodeStatus(status: NodeObservabilityStatus): string {
  const { machine: m, viber: v } = status;
  const w = 55;
  const border = `+${"-".repeat(w + 2)}+`;
  const line = (s: string) => `| ${s.padEnd(w)} |`;

  const lines: string[] = [];

  lines.push(border);
  lines.push(line("NODE OBSERVABILITY".padStart(Math.floor((w + 18) / 2))));
  lines.push(border);

  // Machine section
  lines.push(line("MACHINE RESOURCES"));
  lines.push(border);
  lines.push(line("Host:        " + m.hostname.slice(0, 42)));
  lines.push(line("Platform:    " + m.platform.slice(0, 42)));
  lines.push(line("Arch:        " + m.arch.slice(0, 42)));
  lines.push(line("Uptime:      " + formatUptime(m.systemUptimeSeconds).slice(0, 42)));
  lines.push(line(""));
  lines.push(line("CPU:         " + (m.cpu.cores + " cores, " + m.cpu.averageUsage.toFixed(1) + "% avg").slice(0, 42)));
  lines.push(line("Memory:      " + (formatBytes(m.memory.usedBytes) + " / " + formatBytes(m.memory.totalBytes) + " (" + m.memory.usagePercent.toFixed(1) + "%)").slice(0, 42)));
  lines.push(line("Load Avg:    " + m.loadAverage.map((l) => l.toFixed(2)).join(", ").slice(0, 42)));

  if (m.disks.length > 0) {
    for (const d of m.disks) {
      lines.push(line("Disk " + d.mount.slice(0, 7).padEnd(7) + (formatBytes(d.usedBytes) + " / " + formatBytes(d.totalBytes) + " (" + d.usagePercent.toFixed(1) + "%)").slice(0, 42)));
    }
  }

  if (m.network.length > 0) {
    const nonInternal = m.network.filter((n) => !n.internal);
    if (nonInternal.length > 0) {
      lines.push(line("Network:     " + nonInternal.map((n) => n.name + "=" + (n.ipv4 || "?")).join(", ").slice(0, 42)));
    }
  }

  // Viber section
  lines.push(border);
  lines.push(line("VIBER RUNNING STATUS"));
  lines.push(border);
  lines.push(line("Viber ID:    " + v.viberId.slice(0, 42)));
  lines.push(line("Name:        " + v.viberName.slice(0, 42)));
  lines.push(line("Version:     " + v.version.slice(0, 42)));
  lines.push(line("Connected:   " + (v.connected ? "* Yes" : "o No")));
  lines.push(line("Daemon Up:   " + formatUptime(v.daemonUptimeSeconds).slice(0, 42)));
  lines.push(line("Tasks:       " + (v.runningTaskCount + " running, " + v.totalTasksExecuted + " total").slice(0, 42)));
  lines.push(line("Process Mem: " + (formatBytes(v.processMemory.rss) + " RSS, " + formatBytes(v.processMemory.heapUsed) + " heap").slice(0, 42)));

  if (v.skills.length > 0) {
    lines.push(line("Skills:      " + v.skills.join(", ").slice(0, 42)));
  }
  if (v.capabilities.length > 0) {
    lines.push(line("Capabilities:" + v.capabilities.join(", ").slice(0, 42)));
  }

  if (v.runningTasks.length > 0) {
    lines.push(line(""));
    lines.push(line("Active Tasks:"));
    for (const t of v.runningTasks) {
      const desc = `${t.taskId.slice(0, 16)}... ${t.goal.slice(0, 25)}`;
      lines.push(line(desc.slice(0, w)));
    }
  }

  lines.push(border);

  return lines.join("\n");
}
