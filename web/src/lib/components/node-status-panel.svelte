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
    ChevronDown,
    ChevronUp,
  } from "@lucide/svelte";

  interface MachineMetrics {
    hostname?: string;
    arch?: string;
    systemUptimeSeconds?: number;
    cpu: {
      cores: number;
      averageUsage: number;
    };
    memory: {
      totalBytes: number;
      usedBytes: number;
      usagePercent: number;
    };
    loadAverage?: [number, number, number];
  }

  interface ViberMetrics {
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

  interface Props {
    machine?: MachineMetrics;
    viber?: ViberMetrics;
    skills?: { id: string; name: string; description: string }[];
    capabilities?: string[];
    compact?: boolean;
  }

  let { machine, viber, skills, capabilities, compact = false }: Props = $props();

  let expanded = $state(true);

  // Initialize based on compact prop
  $effect(() => {
    expanded = !compact;
  });

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
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push("< 1m");
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
</script>

{#if !machine && !viber}
  <div class="text-xs text-muted-foreground italic px-1">
    No metrics available yet. Waiting for heartbeat...
  </div>
{:else}
  <div class="space-y-3">
    {#if compact}
      <button
        type="button"
        class="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
        onclick={() => expanded = !expanded}
      >
        <span class="font-medium uppercase tracking-wider">Metrics</span>
        {#if expanded}
          <ChevronUp class="size-3.5" />
        {:else}
          <ChevronDown class="size-3.5" />
        {/if}
      </button>
    {/if}

    {#if !compact || expanded}
      {#if machine}
        <!-- CPU Usage -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Cpu class="size-3.5" />
              <span>CPU</span>
              <span class="text-foreground/50">({machine.cpu.cores} cores)</span>
            </div>
            <span class={`text-xs font-medium tabular-nums ${usageTextColor(machine.cpu.averageUsage)}`}>
              {machine.cpu.averageUsage.toFixed(1)}%
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              class={`h-full rounded-full transition-all duration-500 ${usageColor(machine.cpu.averageUsage)}`}
              style="width: {Math.min(machine.cpu.averageUsage, 100)}%"
            ></div>
          </div>
        </div>

        <!-- Memory Usage -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MemoryStick class="size-3.5" />
              <span>Memory</span>
            </div>
            <span class={`text-xs font-medium tabular-nums ${usageTextColor(machine.memory.usagePercent)}`}>
              {formatBytes(machine.memory.usedBytes)} / {formatBytes(machine.memory.totalBytes)}
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              class={`h-full rounded-full transition-all duration-500 ${usageColor(machine.memory.usagePercent)}`}
              style="width: {Math.min(machine.memory.usagePercent, 100)}%"
            ></div>
          </div>
        </div>

        <!-- Load Average -->
        {#if machine.loadAverage}
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity class="size-3.5" />
              <span>Load Avg</span>
            </div>
            <span class="text-xs font-medium tabular-nums text-foreground">
              {machine.loadAverage.map(l => l.toFixed(2)).join("  ")}
            </span>
          </div>
        {/if}

        <!-- System Uptime -->
        {#if machine.systemUptimeSeconds}
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer class="size-3.5" />
              <span>System Uptime</span>
            </div>
            <span class="text-xs font-medium text-foreground">
              {formatUptime(machine.systemUptimeSeconds)}
            </span>
          </div>
        {/if}
      {/if}

      {#if viber}
        {#if machine}
          <div class="border-t border-border my-2"></div>
        {/if}

        <!-- Daemon Uptime -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap class="size-3.5" />
            <span>Daemon Uptime</span>
          </div>
          <span class="text-xs font-medium text-foreground">
            {formatUptime(viber.daemonUptimeSeconds)}
          </span>
        </div>

        <!-- Tasks -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListTodo class="size-3.5" />
            <span>Tasks</span>
          </div>
          <span class="text-xs font-medium text-foreground">
            <span class={viber.runningTaskCount > 0 ? "text-emerald-500" : ""}>
              {viber.runningTaskCount} running
            </span>
            <span class="text-muted-foreground mx-1">/</span>
            {viber.totalTasksExecuted} total
          </span>
        </div>

        <!-- Process Memory -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Server class="size-3.5" />
            <span>Process Memory</span>
          </div>
          <span class="text-xs font-medium tabular-nums text-foreground">
            {formatBytes(viber.processMemory.rss)} RSS
          </span>
        </div>
      {/if}

      <!-- Skills -->
      {#if skills && skills.length > 0}
        <div class="border-t border-border my-2"></div>
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Puzzle class="size-3.5" />
            <span>Skills ({skills.length})</span>
          </div>
          <div class="flex flex-wrap gap-1 mt-1">
            {#each skills as skill}
              <span
                class="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                title={skill.description}
              >
                {skill.name}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Capabilities -->
      {#if capabilities && capabilities.length > 0}
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Network class="size-3.5" />
            <span>Capabilities</span>
          </div>
          <div class="flex flex-wrap gap-1 mt-1">
            {#each capabilities as cap}
              <span
                class="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {cap}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
{/if}
