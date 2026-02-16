/**
 * System Info skill — expose system telemetry as agent tools.
 *
 * Reuses collectMachineResourceStatus() from daemon/telemetry.ts for
 * CPU, memory, disk, load average, and network. Adds process listing
 * via `ps` and optional DNS connectivity checks.
 */

import { z } from "zod";
import * as os from "os";
import { execSync } from "child_process";
import {
  collectMachineResourceStatus,
  formatBytes,
  formatUptime,
} from "../daemon/telemetry";

// ==================== Helpers ====================

interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  command: string;
}

function getTopProcesses(
  sortBy: "cpu" | "mem" = "cpu",
  limit: number = 10,
): ProcessInfo[] {
  try {
    const flag = sortBy === "cpu" ? "-r" : "-m";
    const output = execSync(`ps aux ${flag}`, {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 5000,
    });

    const lines = output.trim().split("\n").slice(1); // skip header
    const processes: ProcessInfo[] = [];

    for (const line of lines.slice(0, limit)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      processes.push({
        pid: parseInt(parts[1], 10),
        user: parts[0],
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        vsz: parseInt(parts[4], 10) * 1024, // KB → bytes
        rss: parseInt(parts[5], 10) * 1024, // KB → bytes
        command: parts.slice(10).join(" ").slice(0, 200),
      });
    }

    return processes;
  } catch {
    return [];
  }
}

function checkDnsConnectivity(hostname: string): {
  reachable: boolean;
  resolvedAddress?: string;
  error?: string;
} {
  try {
    const output = execSync(
      `dig +short +timeout=3 +tries=1 ${hostname.replace(/[^a-zA-Z0-9.\-]/g, "")} 2>/dev/null || host -W 3 ${hostname.replace(/[^a-zA-Z0-9.\-]/g, "")} 2>/dev/null`,
      { encoding: "utf8", stdio: "pipe", timeout: 5000 },
    );
    const firstLine = output.trim().split("\n")[0]?.trim();
    if (firstLine) {
      return { reachable: true, resolvedAddress: firstLine };
    }
    return { reachable: false, error: "No DNS resolution result" };
  } catch (err: any) {
    return { reachable: false, error: err?.message || String(err) };
  }
}

// ==================== Tools ====================

export function getTools(): Record<string, import("../worker/tool").CoreTool> {
  return {
    system_info: {
      description:
        "Get a full system resource snapshot: CPU (cores, model, usage), memory (total/free/used), disk usage, load averages, hostname, platform, architecture, and uptime. Use when the user asks about system resources, available disk space, memory pressure, or machine specifications.",
      inputSchema: z.object({
        includePerCoreUsage: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include per-core CPU usage percentages (can be verbose on many-core machines).",
          ),
      }),
      execute: async (args: { includePerCoreUsage?: boolean }) => {
        const status = await collectMachineResourceStatus();

        // Build a concise human-readable summary alongside the raw data
        const summary = [
          `Host: ${status.hostname} (${status.platform}, ${status.arch})`,
          `Uptime: ${formatUptime(status.systemUptimeSeconds)}`,
          `CPU: ${status.cpu.cores} cores (${status.cpu.model}), ${status.cpu.averageUsage.toFixed(1)}% avg usage`,
          `Memory: ${formatBytes(status.memory.usedBytes)} / ${formatBytes(status.memory.totalBytes)} (${status.memory.usagePercent.toFixed(1)}% used)`,
          `Load: ${status.loadAverage.map((l) => l.toFixed(2)).join(", ")} (1m, 5m, 15m)`,
          ...status.disks.map(
            (d) =>
              `Disk ${d.mount}: ${formatBytes(d.usedBytes)} / ${formatBytes(d.totalBytes)} (${d.usagePercent.toFixed(1)}% used, ${formatBytes(d.availableBytes)} free)`,
          ),
        ].join("\n");

        const cpu = args.includePerCoreUsage
          ? status.cpu
          : {
            cores: status.cpu.cores,
            model: status.cpu.model,
            speedMHz: status.cpu.speedMHz,
            averageUsage: status.cpu.averageUsage,
          };

        return {
          summary,
          hostname: status.hostname,
          platform: status.platform,
          arch: status.arch,
          systemUptimeSeconds: status.systemUptimeSeconds,
          cpu,
          memory: status.memory,
          disks: status.disks,
          loadAverage: status.loadAverage,
          collectedAt: status.collectedAt,
        };
      },
    },

    system_processes: {
      description:
        "List the top processes on this machine sorted by CPU or memory usage. Use to diagnose which processes are consuming the most resources, or to check if a specific process is running.",
      inputSchema: z.object({
        sortBy: z
          .enum(["cpu", "mem"])
          .optional()
          .default("cpu")
          .describe("Sort processes by CPU usage or memory usage."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Number of processes to return (default 10, max 50)."),
      }),
      execute: async (args: { sortBy?: "cpu" | "mem"; limit?: number }) => {
        const sortBy = args.sortBy ?? "cpu";
        const limit = Math.min(50, Math.max(1, args.limit ?? 10));
        const processes = getTopProcesses(sortBy, limit);

        if (processes.length === 0) {
          return {
            ok: false,
            error:
              "Failed to list processes. The `ps` command may not be available.",
          };
        }

        const summary = processes
          .map(
            (p, i) =>
              `${i + 1}. PID ${p.pid} (${p.user}) — CPU ${p.cpu.toFixed(1)}%, Mem ${p.mem.toFixed(1)}% (${formatBytes(p.rss)} RSS) — ${p.command.slice(0, 80)}`,
          )
          .join("\n");

        return {
          ok: true,
          sortBy,
          count: processes.length,
          summary,
          processes,
        };
      },
    },

    system_network: {
      description:
        "List active network interfaces with their IP addresses and MAC addresses. Optionally check DNS connectivity to a hostname. Use to understand network configuration or verify internet access.",
      inputSchema: z.object({
        checkConnectivity: z
          .string()
          .optional()
          .describe(
            "Optional hostname to DNS-resolve as a connectivity check (e.g. 'google.com').",
          ),
      }),
      execute: async (args: { checkConnectivity?: string }) => {
        const interfaces = os.networkInterfaces();
        const result: Array<{
          name: string;
          ipv4?: string;
          ipv6?: string;
          mac?: string;
          internal: boolean;
        }> = [];

        for (const [name, addrs] of Object.entries(interfaces)) {
          if (!addrs) continue;

          const iface: (typeof result)[number] = {
            name,
            internal: addrs.some((a) => a.internal) ?? false,
          };

          for (const addr of addrs) {
            if (addr.family === "IPv4") {
              iface.ipv4 = addr.address;
              iface.mac = addr.mac;
            } else if (
              addr.family === "IPv6" &&
              !addr.address.startsWith("fe80")
            ) {
              iface.ipv6 = addr.address;
            }
          }

          if (iface.ipv4) {
            result.push(iface);
          }
        }

        const external = result.filter((i) => !i.internal);
        const summary = external.length > 0
          ? external
            .map((i) => `${i.name}: ${i.ipv4}${i.mac ? ` (MAC ${i.mac})` : ""}`)
            .join("\n")
          : "No external network interfaces found.";

        const response: Record<string, unknown> = {
          summary,
          interfaces: result,
        };

        if (args.checkConnectivity) {
          response.connectivity = checkDnsConnectivity(args.checkConnectivity);
        }

        return response;
      },
    },
  };
}
