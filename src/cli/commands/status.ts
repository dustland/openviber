import { Command } from "commander";
import * as path from "path";
import * as os from "os";
import { formatSkillHealthReport, getViberId, SkillHealthReport } from "../common";

export const statusCommand = new Command("status")
  .description("Check viber status, machine resources, and configuration")
  .option("--gateway <url>", "Gateway URL to query for node status")
  .option("--board <url>", "(deprecated: use --gateway) Gateway URL")
  .option("--hub <url>", "(deprecated: use --gateway) Gateway URL")
  .option("--node <id>", "Node ID to query (defaults to local viber-id)")
  .option("--json", "Output in JSON format")
  .option("--local", "Show local machine resources only (no gateway connection)")
  .action(async (options) => {
    const viberId = await getViberId();
    const hasToken = !!process.env.VIBER_TOKEN;
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

    const {
      collectMachineResourceStatus,
      formatBytes,
      formatUptime,
    } = await import("../../daemon/telemetry");

    let skillHealthReport: SkillHealthReport | null = null;
    try {
      const { getSkillHealthReport } = await import("../../skills/health");
      skillHealthReport = await getSkillHealthReport();
    } catch (err: any) {
      if (!options.json) {
        console.warn(
          `[status] Skill health check failed: ${err?.message || String(err)}`,
        );
      }
    }

    // Always show config status
    if (!options.json) {
      console.log(`
Viber Status
────────────────────────────────────
  Viber ID:      ${viberId}
  Token:         ${hasToken ? "✓ Set (VIBER_TOKEN)" : "✗ Not set"}
  OpenRouter:    ${hasOpenRouter ? "✓ Set (OPENROUTER_API_KEY)" : "✗ Not set"}
  Config Dir:    ${path.join(os.homedir(), ".openviber")}
────────────────────────────────────`);
    }

    // Collect local machine status
    const machineStatus = await collectMachineResourceStatus();

    if (options.json) {
      // Try to get gateway status if available
      const statusGatewayUrl =
        options.gateway || options.board || options.hub ||
        process.env.VIBER_GATEWAY_URL || process.env.VIBER_BOARD_URL || process.env.VIBER_HUB_URL ||
        "http://localhost:6007";

      let gatewayNodeStatus = null;
      if (!options.local) {
        try {
          const daemonId = options.node || viberId;
          const res = await fetch(`${statusGatewayUrl}/api/vibers/${daemonId}/status`);
          if (res.ok) {
            gatewayNodeStatus = await res.json();
          }
        } catch {
          // Gateway not reachable, proceed with local only
        }
      }

      console.log(
        JSON.stringify(
          {
            viberId,
            config: {
              token: hasToken,
              openRouter: hasOpenRouter,
              configDir: path.join(os.homedir(), ".openviber"),
            },
            skills: skillHealthReport,
            machine: machineStatus,
            gateway: gatewayNodeStatus,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (skillHealthReport) {
      const lines = formatSkillHealthReport(skillHealthReport);
      if (lines.length > 0) {
        console.log(lines.join("\n"));
      }
    }

    // Display machine resources
    const m = machineStatus;
    console.log(`
Machine Resources
────────────────────────────────────
  Hostname:      ${m.hostname}
  Platform:      ${m.platform}
  Arch:          ${m.arch}
  System Uptime: ${formatUptime(m.systemUptimeSeconds)}

  CPU:           ${m.cpu.cores} cores (${m.cpu.model.trim()})
  CPU Usage:     ${m.cpu.averageUsage.toFixed(1)}% average
  Load Average:  ${m.loadAverage.map((l) => l.toFixed(2)).join(", ")}

  Memory Total:  ${formatBytes(m.memory.totalBytes)}
  Memory Used:   ${formatBytes(m.memory.usedBytes)} (${m.memory.usagePercent.toFixed(1)}%)
  Memory Free:   ${formatBytes(m.memory.freeBytes)}`);

    if (m.disks.length > 0) {
      console.log("");
      console.log("  Disks:");
      for (const d of m.disks) {
        console.log(
          `    ${d.mount.padEnd(12)} ${formatBytes(d.usedBytes)} / ${formatBytes(d.totalBytes)} (${d.usagePercent.toFixed(1)}%)`,
        );
      }
    }

    if (m.network.length > 0) {
      const nonInternal = m.network.filter((n) => !n.internal);
      if (nonInternal.length > 0) {
        console.log("");
        console.log("  Network:");
        for (const iface of nonInternal) {
          console.log(
            `    ${iface.name.padEnd(12)} ${iface.ipv4 || ""}${iface.ipv6 ? "  " + iface.ipv6 : ""}`,
          );
        }
      }
    }

    console.log("────────────────────────────────────");

    // Try to get gateway-based viber running status
    if (!options.local) {
      const statusGatewayUrl2 =
        options.gateway || options.board || options.hub ||
        process.env.VIBER_GATEWAY_URL || process.env.VIBER_BOARD_URL || process.env.VIBER_HUB_URL ||
        "http://localhost:6007";

      try {
        const daemonId = options.node || viberId;
        const res = await fetch(`${statusGatewayUrl2}/api/vibers/${daemonId}/status`);
        if (res.ok) {
          const data = await res.json() as any;
          if (data.status?.viber) {
            const v = data.status.viber;
            console.log(`
Viber Running Status (from gateway)
────────────────────────────────────
  Connected:     ● Yes
  Daemon Uptime: ${formatUptime(v.daemonUptimeSeconds)}
  Running Tasks: ${v.runningTaskCount}
  Total Tasks:   ${v.totalTasksExecuted}
  Process RSS:   ${formatBytes(v.processMemory?.rss || 0)}
  Heap Used:     ${formatBytes(v.processMemory?.heapUsed || 0)}
  Skills:        ${(v.skills || []).join(", ") || "none"}
  Capabilities:  ${(v.capabilities || []).join(", ") || "none"}
────────────────────────────────────`);
          }
        }
      } catch {
        console.log(`
  (Gateway not reachable at default URL — use --gateway to specify)`);
      }
    }

    console.log("");
  });
