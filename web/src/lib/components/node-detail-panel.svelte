<script lang="ts">
  import {
    Activity,
    Cpu,
    HardDrive,
    MemoryStick,
    Network,
    Server,
    Timer,
    Zap,
    ListTodo,
    Puzzle,
    Globe,
    Monitor,
    X,
    RefreshCw,
    Loader2,
  } from "@lucide/svelte";
  import ChannelConfigPanel from "$lib/components/channel-config-panel.svelte";

  interface DetailedStatus {
    machine?: {
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
    };
    viber?: {
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
    };
  }

  interface SkillHealthCheck {
    id: string;
    label: string;
    ok: boolean;
    required?: boolean;
    message?: string;
    hint?: string;
    actionType?: "env" | "oauth" | "binary" | "auth_cli" | "manual";
  }

  interface SkillHealthResult {
    id: string;
    name: string;
    status: string;
    available: boolean;
    checks: SkillHealthCheck[];
    summary: string;
  }

  interface SkillHealthReport {
    generatedAt: string;
    skills: SkillHealthResult[];
  }

  interface Props {
    nodeId: string;
    nodeName: string;
    configSyncState?: {
      configVersion: string;
      lastConfigPullAt: string;
      validations: Array<{
        category: "llm_keys" | "oauth" | "env_secrets" | "skills" | "binary_deps";
        status: "verified" | "failed" | "unchecked";
        message?: string;
        checkedAt: string;
      }>;
    };
    onClose: () => void;
  }

  let { nodeId, nodeName, configSyncState, onClose }: Props = $props();

  let status = $state<DetailedStatus | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let source = $state<string>("");

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(1)} ${units[i]}`;
  }

  function formatUptime(seconds: number): string {
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

  function usageColor(percent: number): string {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-amber-500";
    if (percent >= 50) return "bg-yellow-500";
    return "bg-emerald-500";
  }

  function usageTextColor(percent: number): string {
    if (percent >= 90) return "text-red-500";
    if (percent >= 70) return "text-amber-500";
    if (percent >= 50) return "text-yellow-500";
    return "text-emerald-500";
  }

  function healthLabel(status: string): string {
    switch (status) {
      case "AVAILABLE":
        return "OK";
      case "NOT_AVAILABLE":
        return "MISSING";
      case "UNKNOWN":
        return "UNKNOWN";
      default:
        return status || "UNKNOWN";
    }
  }

  function healthBadgeClass(status: string): string {
    switch (status) {
      case "AVAILABLE":
        return "bg-emerald-500/10 text-emerald-600";
      case "NOT_AVAILABLE":
        return "bg-rose-500/10 text-rose-600";
      case "UNKNOWN":
        return "bg-amber-500/10 text-amber-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/status`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      status = data.status || null;
      source = data.source || "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load status";
      status = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (nodeId) {
      fetchStatus();
    }
  });
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
  <div class="w-full max-w-2xl max-h-[85vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
      <div>
        <h2 class="text-lg font-semibold text-foreground flex items-center gap-2">
          <Monitor class="size-5" />
          {nodeName}
        </h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          {nodeId}
          {#if source}
            <span class="ml-2 text-muted-foreground/60">({source})</span>
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onclick={() => fetchStatus()}
          title="Refresh"
        >
          <RefreshCw class="size-4" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onclick={onClose}
        >
          <X class="size-4" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="overflow-y-auto flex-1 px-5 py-4">
      {#if loading}
        <div class="flex items-center justify-center py-12">
          <div class="flex flex-col items-center gap-3">
            <Loader2 class="size-8 text-muted-foreground animate-spin" />
            <p class="text-sm text-muted-foreground">Loading node status...</p>
          </div>
        </div>
      {:else if error}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      {:else if !status}
        <div class="text-center py-12">
          <Server class="size-10 text-muted-foreground/50 mx-auto mb-3" />
          <p class="text-muted-foreground">
            No status data available. The node may not have sent a heartbeat yet.
          </p>
        </div>
      {:else}
        <div class="space-y-6">
          <!-- Machine Resources Section -->
          {#if status.machine}
            <section>
              <h3 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Server class="size-4" />
                Machine Resources
              </h3>

              <!-- System Info Row -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Platform</div>
                  <div class="text-sm font-medium text-foreground truncate" title={status.machine.platform}>
                    {status.machine.platform}
                  </div>
                </div>
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Arch</div>
                  <div class="text-sm font-medium text-foreground">{status.machine.arch}</div>
                </div>
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Hostname</div>
                  <div class="text-sm font-medium text-foreground truncate" title={status.machine.hostname}>
                    {status.machine.hostname}
                  </div>
                </div>
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Uptime</div>
                  <div class="text-sm font-medium text-foreground">
                    {formatUptime(status.machine.systemUptimeSeconds)}
                  </div>
                </div>
              </div>

              <!-- CPU -->
              <div class="rounded-lg border border-border p-4 mb-3">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Cpu class="size-4" />
                    CPU
                    <span class="text-muted-foreground text-xs font-normal">
                      {status.machine.cpu.cores} cores - {status.machine.cpu.model.trim()}
                    </span>
                  </div>
                  <span class={`text-sm font-bold tabular-nums ${usageTextColor(status.machine.cpu.averageUsage)}`}>
                    {status.machine.cpu.averageUsage.toFixed(1)}%
                  </span>
                </div>
                <div class="h-2 w-full rounded-full bg-muted overflow-hidden mb-3">
                  <div
                    class={`h-full rounded-full transition-all duration-500 ${usageColor(status.machine.cpu.averageUsage)}`}
                    style="width: {Math.min(status.machine.cpu.averageUsage, 100)}%"
                  ></div>
                </div>
                <!-- Per-core usage bars -->
                {#if status.machine.cpu.coreUsages && status.machine.cpu.coreUsages.length > 0}
                  <div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {#each status.machine.cpu.coreUsages as usage, i}
                      <div class="flex flex-col items-center gap-0.5" title={`Core ${i}: ${usage.toFixed(1)}%`}>
                        <div class="w-full h-8 rounded bg-muted overflow-hidden flex flex-col-reverse">
                          <div
                            class={`w-full transition-all duration-500 ${usageColor(usage)}`}
                            style="height: {Math.min(usage, 100)}%"
                          ></div>
                        </div>
                        <span class="text-[9px] text-muted-foreground tabular-nums">{i}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Memory -->
              <div class="rounded-lg border border-border p-4 mb-3">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MemoryStick class="size-4" />
                    Memory
                  </div>
                  <span class={`text-sm font-bold tabular-nums ${usageTextColor(status.machine.memory.usagePercent)}`}>
                    {status.machine.memory.usagePercent.toFixed(1)}%
                  </span>
                </div>
                <div class="h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
                  <div
                    class={`h-full rounded-full transition-all duration-500 ${usageColor(status.machine.memory.usagePercent)}`}
                    style="width: {Math.min(status.machine.memory.usagePercent, 100)}%"
                  ></div>
                </div>
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>Used: {formatBytes(status.machine.memory.usedBytes)}</span>
                  <span>Free: {formatBytes(status.machine.memory.freeBytes)}</span>
                  <span>Total: {formatBytes(status.machine.memory.totalBytes)}</span>
                </div>
              </div>

              <!-- Load Average -->
              <div class="flex items-center justify-between rounded-lg border border-border p-4 mb-3">
                <div class="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Activity class="size-4" />
                  Load Average
                </div>
                <div class="flex gap-4 text-sm tabular-nums">
                  <div class="text-center">
                    <div class="font-bold text-foreground">{status.machine.loadAverage[0].toFixed(2)}</div>
                    <div class="text-[10px] text-muted-foreground">1 min</div>
                  </div>
                  <div class="text-center">
                    <div class="font-bold text-foreground">{status.machine.loadAverage[1].toFixed(2)}</div>
                    <div class="text-[10px] text-muted-foreground">5 min</div>
                  </div>
                  <div class="text-center">
                    <div class="font-bold text-foreground">{status.machine.loadAverage[2].toFixed(2)}</div>
                    <div class="text-[10px] text-muted-foreground">15 min</div>
                  </div>
                </div>
              </div>

              <!-- Disks -->
              {#if status.machine.disks && status.machine.disks.length > 0}
                <div class="rounded-lg border border-border p-4 mb-3">
                  <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                    <HardDrive class="size-4" />
                    Disk Usage
                  </div>
                  <div class="space-y-3">
                    {#each status.machine.disks as disk}
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <span class="text-xs text-muted-foreground font-mono">{disk.mount}</span>
                          <span class={`text-xs font-medium tabular-nums ${usageTextColor(disk.usagePercent)}`}>
                            {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}
                          </span>
                        </div>
                        <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            class={`h-full rounded-full transition-all duration-500 ${usageColor(disk.usagePercent)}`}
                            style="width: {Math.min(disk.usagePercent, 100)}%"
                          ></div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Network -->
              {#if status.machine.network && status.machine.network.length > 0}
                {@const externalIfaces = status.machine.network.filter(n => !n.internal)}
                {#if externalIfaces.length > 0}
                  <div class="rounded-lg border border-border p-4">
                    <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                      <Globe class="size-4" />
                      Network Interfaces
                    </div>
                    <div class="space-y-2">
                      {#each externalIfaces as iface}
                        <div class="flex items-center justify-between text-xs">
                          <span class="font-medium text-foreground font-mono">{iface.name}</span>
                          <div class="text-muted-foreground space-x-3">
                            {#if iface.ipv4}
                              <span>{iface.ipv4}</span>
                            {/if}
                            {#if iface.mac}
                              <span class="text-muted-foreground/60">{iface.mac}</span>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              {/if}
            </section>
          {/if}

          <!-- Viber Running Status Section -->
          {#if status.viber}
            <section>
              <h3 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Zap class="size-4" />
                Viber Running Status
              </h3>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Version</div>
                  <div class="text-sm font-medium text-foreground">{status.viber.version}</div>
                </div>
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Daemon Uptime</div>
                  <div class="text-sm font-medium text-foreground">
                    {formatUptime(status.viber.daemonUptimeSeconds)}
                  </div>
                </div>
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Running Tasks</div>
                  <div class="text-sm font-medium {status.viber.runningTaskCount > 0 ? 'text-emerald-500' : 'text-foreground'}">
                    {status.viber.runningTaskCount}
                  </div>
                </div>
                <div class="rounded-lg border border-border bg-muted/30 p-3">
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Executed</div>
                  <div class="text-sm font-medium text-foreground">{status.viber.totalTasksExecuted}</div>
                </div>
              </div>

              <!-- Process Memory -->
              <div class="rounded-lg border border-border p-4 mb-3">
                <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                  <MemoryStick class="size-4" />
                  Process Memory
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">RSS</div>
                    <div class="text-sm font-medium text-foreground tabular-nums">
                      {formatBytes(status.viber.processMemory.rss)}
                    </div>
                  </div>
                  <div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Heap Total</div>
                    <div class="text-sm font-medium text-foreground tabular-nums">
                      {formatBytes(status.viber.processMemory.heapTotal)}
                    </div>
                  </div>
                  <div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Heap Used</div>
                    <div class="text-sm font-medium text-foreground tabular-nums">
                      {formatBytes(status.viber.processMemory.heapUsed)}
                    </div>
                  </div>
                  <div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">External</div>
                    <div class="text-sm font-medium text-foreground tabular-nums">
                      {formatBytes(status.viber.processMemory.external)}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Running Tasks -->
              {#if status.viber.runningTasks && status.viber.runningTasks.length > 0}
                <div class="rounded-lg border border-border p-4 mb-3">
                  <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                    <ListTodo class="size-4" />
                    Active Tasks ({status.viber.runningTasks.length})
                  </div>
                  <div class="space-y-2">
                    {#each status.viber.runningTasks as task}
                      <div class="rounded-md border border-border bg-muted/20 p-3">
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0 flex-1">
                            <div class="text-xs font-medium text-foreground truncate">
                              {task.goal || task.taskId}
                            </div>
                            <div class="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                              <span class="font-mono">{task.taskId.slice(0, 16)}...</span>
                              {#if task.model}
                                <span class="text-muted-foreground/60">|</span>
                                <span>{task.model}</span>
                              {/if}
                              <span class="text-muted-foreground/60">|</span>
                              <span>{task.messageCount} msgs</span>
                            </div>
                          </div>
                          <span class="shrink-0 flex items-center gap-1 text-[10px] font-medium {task.isRunning ? 'text-emerald-500' : 'text-amber-500'}">
                            <span class="size-1.5 rounded-full {task.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}"></span>
                            {task.isRunning ? "Running" : "Queued"}
                          </span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Config Sync State -->
              {#if configSyncState || status.viber.configState}
                {@const syncState = configSyncState || status.viber.configState}
                <div class="rounded-lg border border-border p-4 mb-3">
                  <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                    <RefreshCw class="size-4" />
                    Config Sync State
                  </div>
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-muted-foreground">Status</span>
                      {@const allVerified = syncState.validations.every(v => v.status === "verified")}
                      {@const anyFailed = syncState.validations.some(v => v.status === "failed")}
                      {@const syncStatus = allVerified ? "verified" : anyFailed ? "failed" : "pending"}
                      <span class={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium ${
                        syncStatus === "verified" ? "bg-emerald-500/10 text-emerald-600" :
                        syncStatus === "failed" ? "bg-rose-500/10 text-rose-600" :
                        "bg-amber-500/10 text-amber-600"
                      }`}>
                        {syncStatus === "verified" ? "Verified" : syncStatus === "failed" ? "Failed" : "Pending"}
                      </span>
                    </div>
                    {#if syncState.configVersion}
                      <div class="text-xs text-muted-foreground">
                        Version: <span class="font-mono">{syncState.configVersion.slice(0, 8)}...</span>
                      </div>
                    {/if}
                    {#if syncState.lastConfigPullAt}
                      {@const lastPull = new Date(syncState.lastConfigPullAt)}
                      {@const minutesAgo = Math.floor((Date.now() - lastPull.getTime()) / 60000)}
                      <div class="text-xs text-muted-foreground">
                        Last verified: {minutesAgo < 1 ? "just now" : `${minutesAgo}m ago`}
                      </div>
                    {/if}
                    {#if syncState.validations && syncState.validations.length > 0}
                      <div class="mt-2 space-y-1">
                        {#each syncState.validations as validation}
                          <div class="text-[11px] flex items-center gap-2">
                            <span class={`size-1.5 rounded-full ${
                              validation.status === "verified" ? "bg-emerald-500" :
                              validation.status === "failed" ? "bg-rose-500" :
                              "bg-amber-500"
                            }`}></span>
                            <span class="text-muted-foreground">
                              {validation.category}: {validation.message || validation.status}
                            </span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- Skill Health -->
              {#if status.viber.skillHealth?.skills && status.viber.skillHealth.skills.length > 0}
                <div class="rounded-lg border border-border p-4 mb-3">
                  <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                    <Puzzle class="size-4" />
                    Skill Health
                  </div>
                  <div class="space-y-2">
                    {#each status.viber.skillHealth.skills as skill}
                      {@const missingChecks = skill.checks?.filter((c) => (c.required ?? true) && !c.ok) || []}
                      <div class="rounded-md border border-border bg-muted/20 p-3">
                        <div class="flex items-center justify-between gap-2">
                          <div class="text-xs font-medium text-foreground">
                            {skill.name || skill.id}
                          </div>
                          <span class={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${healthBadgeClass(skill.status)}`}>
                            {healthLabel(skill.status)}
                          </span>
                        </div>
                        {#if skill.status !== "AVAILABLE"}
                          <div class="mt-2 space-y-1 text-[11px] text-muted-foreground">
                            {#if missingChecks.length === 0}
                              <div>{skill.summary}</div>
                            {:else}
                              {#each missingChecks as check}
                                <div class="flex items-center justify-between">
                                  <span>
                                    - {check.label}: {check.hint || check.message || "missing"}
                                  </span>
                                  {#if check.actionType === "oauth"}
                                    <button
                                      type="button"
                                      class="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                      onclick={() => window.open(`/auth/${check.hint?.includes("google") ? "google" : "github"}`, "_blank")}
                                    >
                                      Connect
                                    </button>
                                  {:else if check.actionType === "binary" && check.hint}
                                    <button
                                      type="button"
                                      class="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                      onclick={() => {
                                        navigator.clipboard.writeText(check.hint || "");
                                        alert("Install command copied to clipboard");
                                      }}
                                    >
                                      Copy cmd
                                    </button>
                                  {:else if check.actionType === "env" && check.hint}
                                    <button
                                      type="button"
                                      class="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                      onclick={() => {
                                        navigator.clipboard.writeText(check.hint || "");
                                        alert("Env var hint copied to clipboard");
                                      }}
                                    >
                                      Copy hint
                                    </button>
                                  {/if}
                                </div>
                              {/each}
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                  <div class="text-[11px] text-muted-foreground/60 text-right mt-2">
                    Updated: {new Date(status.viber.skillHealth.generatedAt).toLocaleTimeString()}
                  </div>
                </div>
              {/if}

              <!-- Skills & Capabilities -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {#if status.viber.skills && status.viber.skills.length > 0}
                  <div class="rounded-lg border border-border p-4">
                    <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                      <Puzzle class="size-4" />
                      Skills ({status.viber.skills.length})
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each status.viber.skills as skill}
                        <span class="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {skill}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if status.viber.capabilities && status.viber.capabilities.length > 0}
                  <div class="rounded-lg border border-border p-4">
                    <div class="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                      <Network class="size-4" />
                      Capabilities ({status.viber.capabilities.length})
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each status.viber.capabilities as cap}
                        <span class="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {cap}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              <!-- Last Heartbeat & Collection Time -->
              <div class="text-[11px] text-muted-foreground/60 text-right mt-2">
                {#if status.viber.lastHeartbeatAt}
                  Last heartbeat: {new Date(status.viber.lastHeartbeatAt).toLocaleTimeString()}
                {/if}
                {#if status.viber.collectedAt}
                  <span class="ml-3">Collected: {new Date(status.viber.collectedAt).toLocaleTimeString()}</span>
                {/if}
              </div>
            </section>
          {/if}

          <ChannelConfigPanel nodeId={nodeId} />
        </div>
      {/if}
    </div>
  </div>
</div>
