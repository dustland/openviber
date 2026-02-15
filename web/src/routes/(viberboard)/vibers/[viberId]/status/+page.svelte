<script lang="ts">
  import { page } from "$app/stores";
  import {
    Activity,
    Cpu,
    HardDrive,
    MemoryStick,
    Network,
    Server,
    Zap,
    ListTodo,
    Puzzle,
    Globe,
    RefreshCw,
  } from "@lucide/svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";

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
      totalTasksExecuted: number;
      lastHeartbeatAt?: string;
      collectedAt: string;
    };
  }

  let { data } = $props();
  const viberId = $derived(data.viberId);

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

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      const res = await fetch(
        `/api/vibers/${encodeURIComponent(viberId)}/status`,
      );
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
    if (viberId) {
      fetchStatus();
    }
  });
</script>

<div class="p-6 space-y-6">
  {#if loading}
    <div class="space-y-6">
      <!-- System Info Row skeleton -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {#each Array(4) as _}
          <div
            class="rounded-lg border border-border bg-muted/30 p-3 space-y-2"
          >
            <Skeleton class="h-2.5 w-12" />
            <Skeleton class="h-4 w-3/4" />
          </div>
        {/each}
      </div>

      <!-- CPU skeleton -->
      <div class="rounded-lg border border-border p-4 space-y-3">
        <div class="flex items-center justify-between">
          <Skeleton class="h-4 w-32" />
          <Skeleton class="h-4 w-10" />
        </div>
        <Skeleton class="h-2 w-full rounded-full" />
        <div class="grid grid-cols-8 gap-1.5">
          {#each Array(8) as _}
            <Skeleton class="h-8 w-full rounded" />
          {/each}
        </div>
      </div>

      <!-- Memory skeleton -->
      <div class="rounded-lg border border-border p-4 space-y-3">
        <div class="flex items-center justify-between">
          <Skeleton class="h-4 w-24" />
          <Skeleton class="h-4 w-10" />
        </div>
        <Skeleton class="h-2 w-full rounded-full" />
        <div class="flex justify-between">
          <Skeleton class="h-3 w-20" />
          <Skeleton class="h-3 w-20" />
          <Skeleton class="h-3 w-20" />
        </div>
      </div>
    </div>
  {:else if error}
    <div
      class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm"
    >
      {error}
    </div>
  {:else if !status}
    <div class="text-center py-16">
      <Server class="size-10 text-muted-foreground/50 mx-auto mb-3" />
      <p class="text-muted-foreground">
        No status data available. The viber may not have sent a heartbeat yet.
      </p>
    </div>
  {:else}
    <!-- Machine Resources -->
    {#if status.machine}
      <section>
        <h3
          class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"
        >
          <Server class="size-4" />
          Machine Resources
          {#if source}
            <span class="text-xs font-normal text-muted-foreground/60"
              >({source})</span
            >
          {/if}
        </h3>

        <!-- System Info Row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Platform
            </div>
            <div
              class="text-sm font-medium text-foreground truncate"
              title={status.machine.platform}
            >
              {status.machine.platform}
            </div>
          </div>
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Arch
            </div>
            <div class="text-sm font-medium text-foreground">
              {status.machine.arch}
            </div>
          </div>
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Hostname
            </div>
            <div
              class="text-sm font-medium text-foreground truncate"
              title={status.machine.hostname}
            >
              {status.machine.hostname}
            </div>
          </div>
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Uptime
            </div>
            <div class="text-sm font-medium text-foreground">
              {formatUptime(status.machine.systemUptimeSeconds)}
            </div>
          </div>
        </div>

        <!-- CPU -->
        <div class="rounded-lg border border-border p-4 mb-3">
          <div class="flex items-center justify-between mb-2">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Cpu class="size-4" />
              CPU
              <span class="text-muted-foreground text-xs font-normal">
                {status.machine.cpu.cores} cores - {status.machine.cpu.model.trim()}
              </span>
            </div>
            <span
              class={`text-sm font-bold tabular-nums ${usageTextColor(status.machine.cpu.averageUsage)}`}
            >
              {status.machine.cpu.averageUsage.toFixed(1)}%
            </span>
          </div>
          <div class="h-2 w-full rounded-full bg-muted overflow-hidden mb-3">
            <div
              class={`h-full rounded-full transition-all duration-500 ${usageColor(status.machine.cpu.averageUsage)}`}
              style="width: {Math.min(status.machine.cpu.averageUsage, 100)}%"
            ></div>
          </div>
          {#if status.machine.cpu.coreUsages && status.machine.cpu.coreUsages.length > 0}
            <div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {#each status.machine.cpu.coreUsages as usage, i}
                <div
                  class="flex flex-col items-center gap-0.5"
                  title={`Core ${i}: ${usage.toFixed(1)}%`}
                >
                  <div
                    class="w-full h-8 rounded bg-muted overflow-hidden flex flex-col-reverse"
                  >
                    <div
                      class={`w-full transition-all duration-500 ${usageColor(usage)}`}
                      style="height: {Math.min(usage, 100)}%"
                    ></div>
                  </div>
                  <span class="text-[9px] text-muted-foreground tabular-nums"
                    >{i}</span
                  >
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Memory -->
        <div class="rounded-lg border border-border p-4 mb-3">
          <div class="flex items-center justify-between mb-2">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <MemoryStick class="size-4" />
              Memory
            </div>
            <span
              class={`text-sm font-bold tabular-nums ${usageTextColor(status.machine.memory.usagePercent)}`}
            >
              {status.machine.memory.usagePercent.toFixed(1)}%
            </span>
          </div>
          <div class="h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
            <div
              class={`h-full rounded-full transition-all duration-500 ${usageColor(status.machine.memory.usagePercent)}`}
              style="width: {Math.min(
                status.machine.memory.usagePercent,
                100,
              )}%"
            ></div>
          </div>
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Used: {formatBytes(status.machine.memory.usedBytes)}</span>
            <span>Free: {formatBytes(status.machine.memory.freeBytes)}</span>
            <span>Total: {formatBytes(status.machine.memory.totalBytes)}</span>
          </div>
        </div>

        <!-- Load Average -->
        <div
          class="flex items-center justify-between rounded-lg border border-border p-4 mb-3"
        >
          <div
            class="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Activity class="size-4" />
            Load Average
          </div>
          <div class="flex gap-4 text-sm tabular-nums">
            <div class="text-center">
              <div class="font-bold text-foreground">
                {status.machine.loadAverage[0].toFixed(2)}
              </div>
              <div class="text-[10px] text-muted-foreground">1 min</div>
            </div>
            <div class="text-center">
              <div class="font-bold text-foreground">
                {status.machine.loadAverage[1].toFixed(2)}
              </div>
              <div class="text-[10px] text-muted-foreground">5 min</div>
            </div>
            <div class="text-center">
              <div class="font-bold text-foreground">
                {status.machine.loadAverage[2].toFixed(2)}
              </div>
              <div class="text-[10px] text-muted-foreground">15 min</div>
            </div>
          </div>
        </div>

        <!-- Disks -->
        {#if status.machine.disks && status.machine.disks.length > 0}
          <div class="rounded-lg border border-border p-4 mb-3">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground mb-3"
            >
              <HardDrive class="size-4" />
              Disk Usage
            </div>
            <div class="space-y-3">
              {#each status.machine.disks as disk}
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs text-muted-foreground font-mono"
                      >{disk.mount}</span
                    >
                    <span
                      class={`text-xs font-medium tabular-nums ${usageTextColor(disk.usagePercent)}`}
                    >
                      {formatBytes(disk.usedBytes)} / {formatBytes(
                        disk.totalBytes,
                      )}
                    </span>
                  </div>
                  <div
                    class="h-1.5 w-full rounded-full bg-muted overflow-hidden"
                  >
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
          {@const externalIfaces = status.machine.network.filter(
            (n) => !n.internal,
          )}
          {#if externalIfaces.length > 0}
            <div class="rounded-lg border border-border p-4">
              <div
                class="flex items-center gap-2 text-sm font-medium text-foreground mb-3"
              >
                <Globe class="size-4" />
                Network Interfaces
              </div>
              <div class="space-y-2">
                {#each externalIfaces as iface}
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-medium text-foreground font-mono"
                      >{iface.name}</span
                    >
                    <div class="text-muted-foreground space-x-3">
                      {#if iface.ipv4}
                        <span>{iface.ipv4}</span>
                      {/if}
                      {#if iface.mac}
                        <span class="text-muted-foreground/60">{iface.mac}</span
                        >
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

    <!-- Viber Running Status -->
    {#if status.viber}
      <section>
        <h3
          class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"
        >
          <Zap class="size-4" />
          Viber Running Status
        </h3>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Version
            </div>
            <div class="text-sm font-medium text-foreground">
              {status.viber.version}
            </div>
          </div>
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Daemon Uptime
            </div>
            <div class="text-sm font-medium text-foreground">
              {formatUptime(status.viber.daemonUptimeSeconds)}
            </div>
          </div>
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Running Tasks
            </div>
            <div
              class="text-sm font-medium {status.viber.runningTaskCount > 0
                ? 'text-emerald-500'
                : 'text-foreground'}"
            >
              {status.viber.runningTaskCount}
            </div>
          </div>
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <div
              class="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"
            >
              Total Executed
            </div>
            <div class="text-sm font-medium text-foreground">
              {status.viber.totalTasksExecuted}
            </div>
          </div>
        </div>

        <!-- Process Memory -->
        <div class="rounded-lg border border-border p-4 mb-3">
          <div
            class="flex items-center gap-2 text-sm font-medium text-foreground mb-3"
          >
            <MemoryStick class="size-4" />
            Process Memory
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div
                class="text-[10px] text-muted-foreground uppercase tracking-wider"
              >
                RSS
              </div>
              <div class="text-sm font-medium text-foreground tabular-nums">
                {formatBytes(status.viber.processMemory.rss)}
              </div>
            </div>
            <div>
              <div
                class="text-[10px] text-muted-foreground uppercase tracking-wider"
              >
                Heap Total
              </div>
              <div class="text-sm font-medium text-foreground tabular-nums">
                {formatBytes(status.viber.processMemory.heapTotal)}
              </div>
            </div>
            <div>
              <div
                class="text-[10px] text-muted-foreground uppercase tracking-wider"
              >
                Heap Used
              </div>
              <div class="text-sm font-medium text-foreground tabular-nums">
                {formatBytes(status.viber.processMemory.heapUsed)}
              </div>
            </div>
            <div>
              <div
                class="text-[10px] text-muted-foreground uppercase tracking-wider"
              >
                External
              </div>
              <div class="text-sm font-medium text-foreground tabular-nums">
                {formatBytes(status.viber.processMemory.external)}
              </div>
            </div>
          </div>
        </div>

        <!-- Running Tasks -->
        {#if status.viber.runningTasks && status.viber.runningTasks.length > 0}
          <div class="rounded-lg border border-border p-4 mb-3">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground mb-3"
            >
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
                      <div
                        class="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2"
                      >
                        <span class="font-mono"
                          >{task.taskId.slice(0, 16)}...</span
                        >
                        {#if task.model}
                          <span class="text-muted-foreground/60">|</span>
                          <span>{task.model}</span>
                        {/if}
                        <span class="text-muted-foreground/60">|</span>
                        <span>{task.messageCount} msgs</span>
                      </div>
                    </div>
                    <span
                      class="shrink-0 flex items-center gap-1 text-[10px] font-medium {task.isRunning
                        ? 'text-emerald-500'
                        : 'text-amber-500'}"
                    >
                      <span
                        class="size-1.5 rounded-full {task.isRunning
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-amber-500'}"
                      ></span>
                      {task.isRunning ? "Running" : "Queued"}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Last Heartbeat & Collection Time -->
        <div class="text-[11px] text-muted-foreground/60 text-right mt-2">
          {#if status.viber.lastHeartbeatAt}
            Last heartbeat: {new Date(
              status.viber.lastHeartbeatAt,
            ).toLocaleTimeString()}
          {/if}
          {#if status.viber.collectedAt}
            <span class="ml-3"
              >Collected: {new Date(
                status.viber.collectedAt,
              ).toLocaleTimeString()}</span
            >
          {/if}
        </div>
      </section>
    {/if}
  {/if}
</div>
