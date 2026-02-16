<script lang="ts">
  import { onMount } from "svelte";
  import {
    CalendarClock,
    Check,
    ChevronRight,
    Clock,
    Copy,
    Cpu,
    ListTodo,
    MemoryStick,
    Plus,
    Radio,
    RefreshCw,
    Server,
    Trash2,
    Zap,
    Monitor,
    Globe,
    Puzzle,
    Activity,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Badge } from "$lib/components/ui/badge";

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

  interface Viber {
    id: string;
    name: string;
    viber_id: string | null;
    status: "pending" | "active" | "offline";
    onboard_token: string | null;
    token_expires_at: string | null;
    created_at: string;
    config_sync_state?: {
      configVersion?: string;
      lastConfigPullAt?: string;
      validations?: Array<{
        category: string;
        status: string;
        message?: string;
        checkedAt: string;
      }>;
    };
    version?: string;
    platform?: string;
    capabilities?: string[];
    skills?: { id: string; name: string; description: string }[];
    lastHeartbeat?: string;
    runningVibers?: string[];
    machine?: MachineMetrics;
    viber?: ViberMetrics;
  }

  let vibers = $state<Viber[]>([]);
  let loading = $state(true);
  let creating = $state(false);
  let copiedId = $state<string | null>(null);
  let copiedGuideCommand = $state(false);
  let showCreateDialog = $state(false);
  let newViberName = $state("My Viber");
  let onboardingViber = $state<Viber | null>(null);

  const activeVibers = $derived(vibers.filter((v) => v.status === "active"));
  const inactiveVibers = $derived(vibers.filter((v) => v.status !== "active"));

  function getOnboardCommand(token: string) {
    return `npx openviber onboard --token ${token}`;
  }

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

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
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function statusLabel(status: Viber["status"]) {
    switch (status) {
      case "active":
        return "Active";
      case "pending":
        return "Pending";
      default:
        return "Offline";
    }
  }

  function statusBadgeClass(status: Viber["status"]) {
    switch (status) {
      case "active":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "pending":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
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

  async function fetchVibers() {
    try {
      const response = await fetch("/api/vibers");
      const payload = await response.json();
      vibers = Array.isArray(payload.vibers) ? payload.vibers : [];
    } catch (error) {
      console.error("Failed to fetch vibers:", error);
      vibers = [];
    }
  }

  async function createViber() {
    creating = true;
    try {
      const response = await fetch("/api/vibers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newViberName.trim() || "My Viber" }),
      });
      const payload = await response.json();
      if (payload?.viber) {
        onboardingViber = payload.viber;
        await fetchVibers();
      }
    } catch (error) {
      console.error("Failed to create viber:", error);
    } finally {
      creating = false;
    }
  }

  async function deleteViber(viberId: string) {
    const ok = window.confirm("Delete this viber?");
    if (!ok) return;

    try {
      await fetch("/api/vibers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: viberId }),
      });
      await fetchVibers();
    } catch (error) {
      console.error("Failed to delete viber:", error);
    }
  }

  async function copyCommand(viber: Viber) {
    if (!viber.onboard_token) return;

    try {
      await navigator.clipboard.writeText(
        getOnboardCommand(viber.onboard_token),
      );
      copiedId = viber.id;
      setTimeout(() => {
        if (copiedId === viber.id) copiedId = null;
      }, 1800);
    } catch (error) {
      console.error("Failed to copy command:", error);
    }
  }

  async function copyGuideCommand() {
    if (!onboardingViber?.onboard_token) return;

    try {
      await navigator.clipboard.writeText(
        getOnboardCommand(onboardingViber.onboard_token),
      );
      copiedGuideCommand = true;
      setTimeout(() => {
        copiedGuideCommand = false;
      }, 1800);
    } catch (error) {
      console.error("Failed to copy onboard guide command:", error);
    }
  }

  function closeCreateDialog() {
    showCreateDialog = false;
    newViberName = "My Viber";
    onboardingViber = null;
    copiedGuideCommand = false;
  }

  function getViberHref(viber: Viber): string {
    const effectiveId = viber.viber_id || viber.id;
    return `/vibers/${effectiveId}/status`;
  }

  function getConfigSyncBadge(syncState?: Viber["config_sync_state"]): {
    label: string;
    class: string;
  } | null {
    if (!syncState?.configVersion) return null;

    const validations = syncState.validations || [];
    const failed = validations.filter((v) => v.status === "failed");
    const verified = validations.filter((v) => v.status === "verified");

    if (failed.length > 0) {
      return {
        label: "Config Failed",
        class: "bg-rose-500/10 text-rose-600 border-rose-500/20",
      };
    }
    if (verified.length > 0 && failed.length === 0) {
      return {
        label: "Config Verified",
        class: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      };
    }
    if (syncState.lastConfigPullAt) {
      return {
        label: "Config Delivered",
        class: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      };
    }
    return {
      label: "Config Pending",
      class: "bg-muted text-muted-foreground border-border",
    };
  }

  onMount(() => {
    loading = true;
    fetchVibers().finally(() => {
      loading = false;
    });

    const interval = setInterval(() => {
      fetchVibers();
    }, 30000);

    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>Vibers - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto flex flex-col">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold text-foreground">Vibers</h1>
      <p class="text-sm mt-0.5 text-muted-foreground">
        Manage machine registrations and monitor resource usage.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        onclick={() => (showCreateDialog = true)}
      >
        <Plus class="size-4" />
        <span class="hidden sm:inline">Onboard Viber</span>
      </Button>
      <Button variant="outline" size="icon" onclick={() => fetchVibers()}>
        <RefreshCw class="size-4" />
      </Button>
    </div>
  </div>

  {#if loading}
    <div class="space-y-4">
      {#each Array(2) as _}
        <div class="rounded-xl border border-border bg-card p-5 space-y-4">
          <div class="flex items-start justify-between">
            <div class="space-y-2 flex-1">
              <div class="flex items-center gap-3">
                <Skeleton class="h-5 w-40" />
                <Skeleton class="h-5 w-16 rounded-full" />
              </div>
              <div class="flex items-center gap-4">
                <Skeleton class="h-3.5 w-24" />
                <Skeleton class="h-3.5 w-20" />
                <Skeleton class="h-3.5 w-28" />
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <Skeleton class="h-8 w-28 rounded-md" />
              <Skeleton class="h-8 w-20 rounded-md" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Skeleton class="h-3 w-12" />
              <Skeleton class="h-2.5 w-full rounded-full" />
            </div>
            <div class="space-y-2">
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-2.5 w-full rounded-full" />
            </div>
          </div>
          <div class="flex gap-2">
            <Skeleton class="h-5 w-16 rounded-md" />
            <Skeleton class="h-5 w-20 rounded-md" />
            <Skeleton class="h-5 w-14 rounded-md" />
          </div>
        </div>
      {/each}
    </div>
  {:else if vibers.length === 0}
    <div
      class="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center"
    >
      <Server class="mx-auto mb-4 size-10 text-muted-foreground/60" />
      <h2 class="text-lg font-medium text-foreground">No vibers yet</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Create a viber and onboard your first machine.
      </p>
      <Button class="mt-4" onclick={() => (showCreateDialog = true)}>
        <Plus class="size-4" />
        Onboard Viber
      </Button>
    </div>
  {:else}
    <!-- Active Vibers -->
    {#if activeVibers.length > 0}
      <div class="mb-6">
        <h2
          class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"
        >
          <span class="size-2 rounded-full bg-green-500"></span>
          Active ({activeVibers.length})
        </h2>
        <div class="space-y-4">
          {#each activeVibers as viber (viber.id)}
            {@const effectiveId = viber.viber_id || viber.id}
            <div
              class="rounded-xl border border-border bg-card overflow-hidden transition-all hover:shadow-sm"
            >
              <!-- Card Header -->
              <a
                href={getViberHref(viber)}
                class="block px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-3 flex-wrap">
                      <h3
                        class="text-lg font-semibold text-foreground truncate"
                      >
                        {viber.name}
                      </h3>
                      <span
                        class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(viber.status)}`}
                      >
                        {statusLabel(viber.status)}
                      </span>
                      {#if getConfigSyncBadge(viber.config_sync_state)}
                        {@const badge = getConfigSyncBadge(
                          viber.config_sync_state,
                        )}
                        {#if badge}
                          <span
                            class={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badge.class}`}
                          >
                            {badge.label}
                          </span>
                        {/if}
                      {/if}
                    </div>
                    <div
                      class="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap"
                    >
                      {#if viber.machine?.hostname}
                        <span class="inline-flex items-center gap-1.5">
                          <Monitor class="size-3.5" />
                          {viber.machine.hostname}
                        </span>
                      {/if}
                      {#if viber.version}
                        <span>v{viber.version}</span>
                      {/if}
                      {#if viber.platform}
                        <span class="inline-flex items-center gap-1.5">
                          <Globe class="size-3.5" />
                          {viber.platform}
                        </span>
                      {/if}
                      {#if viber.machine?.arch}
                        <span>{viber.machine.arch}</span>
                      {/if}
                      {#if viber.viber}
                        <span
                          class="inline-flex items-center gap-1 text-muted-foreground/70"
                        >
                          <Activity class="size-3" />
                          up {formatUptime(viber.viber.daemonUptimeSeconds)}
                        </span>
                      {/if}
                      {#if viber.lastHeartbeat}
                        <span class="text-muted-foreground/50">
                          heartbeat {formatTimeAgo(viber.lastHeartbeat)}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      class="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                      onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteViber(viber.id);
                      }}
                    >
                      <Trash2 class="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </a>

              <!-- Compact Resource Metrics (CPU + Memory) -->
              {#if viber.machine}
                <div class="border-t border-border px-5 py-3">
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                    <!-- CPU -->
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between">
                        <span
                          class="text-xs text-muted-foreground inline-flex items-center gap-1.5 min-w-0"
                        >
                          <Cpu class="size-3.5" />
                          CPU
                          {#if viber.machine.cpu.cores}
                            <span class="text-muted-foreground/50"
                              >({viber.machine.cpu.cores} cores)</span
                            >
                          {/if}
                        </span>
                        <span
                          class={`text-sm font-semibold tabular-nums ${usageTextColor(viber.machine.cpu.averageUsage)}`}
                        >
                          {viber.machine.cpu.averageUsage.toFixed(0)}%
                        </span>
                      </div>
                      <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          class={`h-full rounded-full transition-all duration-500 ${usageColor(viber.machine.cpu.averageUsage)}`}
                          style="width: {Math.min(
                            viber.machine.cpu.averageUsage,
                            100,
                          )}%"
                        ></div>
                      </div>
                    </div>
                    <!-- Memory -->
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between">
                        <span
                          class="text-xs text-muted-foreground inline-flex items-center gap-1.5 min-w-0"
                        >
                          <MemoryStick class="size-3.5" />
                          Memory
                          <span class="text-muted-foreground/50"
                            >{formatBytes(viber.machine.memory.usedBytes)} / {formatBytes(
                              viber.machine.memory.totalBytes,
                            )}</span
                          >
                        </span>
                        <span
                          class={`text-sm font-semibold tabular-nums ${usageTextColor(viber.machine.memory.usagePercent)}`}
                        >
                          {viber.machine.memory.usagePercent.toFixed(0)}%
                        </span>
                      </div>
                      <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          class={`h-full rounded-full transition-all duration-500 ${usageColor(viber.machine.memory.usagePercent)}`}
                          style="width: {Math.min(
                            viber.machine.memory.usagePercent,
                            100,
                          )}%"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Quick Links Strip -->
              <div
                class="border-t border-border grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0"
              >
                <!-- Tasks -->
                <a
                  href="/vibers/{effectiveId}/tasks"
                  class="flex items-center gap-2 px-3 py-3 text-sm hover:bg-muted/40 transition-colors group min-w-0 sm:px-4"
                >
                  <ListTodo
                    class="size-4 text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                  <span
                    class="text-muted-foreground group-hover:text-foreground transition-colors truncate"
                    >Tasks</span
                  >
                  {#if viber.viber}
                    <span
                      class="ml-auto hidden text-xs font-medium tabular-nums text-muted-foreground/70 xl:inline"
                    >
                      {viber.viber.runningTaskCount} active · {viber.viber
                        .totalTasksExecuted} total
                    </span>
                  {/if}
                  <ChevronRight
                    class="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
                  />
                </a>
                <!-- Skills -->
                <a
                  href="/vibers/{effectiveId}/skills"
                  class="flex items-center gap-2 px-3 py-3 text-sm hover:bg-muted/40 transition-colors group min-w-0 sm:px-4"
                >
                  <Puzzle
                    class="size-4 text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                  <span
                    class="text-muted-foreground group-hover:text-foreground transition-colors truncate"
                    >Skills</span
                  >
                  {#if viber.skills && viber.skills.length > 0}
                    <span
                      class="ml-auto text-xs font-medium tabular-nums text-muted-foreground/70"
                    >
                      {viber.skills.length}
                    </span>
                  {/if}
                  <ChevronRight
                    class="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
                  />
                </a>
                <!-- Jobs -->
                <a
                  href="/vibers/{effectiveId}/jobs"
                  class="flex items-center gap-2 px-3 py-3 text-sm hover:bg-muted/40 transition-colors group min-w-0 sm:px-4"
                >
                  <CalendarClock
                    class="size-4 text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                  <span
                    class="text-muted-foreground group-hover:text-foreground transition-colors truncate"
                    >Jobs</span
                  >
                  <ChevronRight
                    class="size-3.5 ml-auto text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
                  />
                </a>
                <!-- Channels -->
                <a
                  href="/vibers/{effectiveId}/channels"
                  class="flex items-center gap-2 px-3 py-3 text-sm hover:bg-muted/40 transition-colors group min-w-0 sm:px-4"
                >
                  <Radio
                    class="size-4 text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                  <span
                    class="text-muted-foreground group-hover:text-foreground transition-colors truncate"
                    >Channels</span
                  >
                  <ChevronRight
                    class="size-3.5 ml-auto text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
                  />
                </a>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Inactive / Pending Vibers -->
    {#if inactiveVibers.length > 0}
      <div>
        <h2
          class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"
        >
          <span class="size-2 rounded-full bg-gray-400"></span>
          Inactive ({inactiveVibers.length})
        </h2>
        <div class="space-y-4">
          {#each inactiveVibers as viber (viber.id)}
            <a
              href={getViberHref(viber)}
              class="block rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <div class="px-5 py-4 flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-3">
                    <h3 class="text-lg font-semibold text-foreground truncate">
                      {viber.name}
                    </h3>
                    <span
                      class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(viber.status)}`}
                    >
                      {statusLabel(viber.status)}
                    </span>
                  </div>
                  <p class="text-sm text-muted-foreground mt-1">
                    Created {formatTimeAgo(viber.created_at)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  class="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 shrink-0"
                  onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteViber(viber.id);
                  }}
                >
                  <Trash2 class="size-3.5" />
                  Delete
                </Button>
              </div>

              {#if viber.onboard_token || viber.token_expires_at}
                <div
                  class="border-t border-border px-5 py-3 flex items-center gap-3"
                >
                  {#if viber.onboard_token}
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      onclick={() => copyCommand(viber)}
                    >
                      {#if copiedId === viber.id}
                        <Check class="size-3.5" />
                        Copied
                      {:else}
                        <Copy class="size-3.5" />
                        Copy Onboard Command
                      {/if}
                    </button>
                  {/if}
                  {#if viber.token_expires_at}
                    <span
                      class="text-xs text-muted-foreground inline-flex items-center gap-1.5"
                    >
                      <Clock class="size-3" />
                      Token expires {new Date(
                        viber.token_expires_at,
                      ).toLocaleString()}
                    </span>
                  {/if}
                </div>
              {/if}
            </a>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Create Viber Dialog -->
{#if showCreateDialog}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
  >
    <div
      class="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
    >
      {#if onboardingViber?.onboard_token}
        <h3 class="text-lg font-semibold text-foreground">Connection Guide</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          Run this command on the machine you want to connect.
        </p>
        <div class="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <div class="flex items-center gap-2">
            <code class="flex-1 overflow-x-auto text-xs text-foreground">
              {getOnboardCommand(onboardingViber.onboard_token)}
            </code>
            <Button
              size="icon"
              variant="outline"
              class="shrink-0"
              onclick={copyGuideCommand}
              aria-label="Copy onboard command"
            >
              {#if copiedGuideCommand}
                <Check class="size-4" />
              {:else}
                <Copy class="size-4" />
              {/if}
            </Button>
          </div>
          {#if onboardingViber.token_expires_at}
            <p class="mt-2 text-xs text-muted-foreground">
              Token expires {new Date(onboardingViber.token_expires_at).toLocaleString()}
            </p>
          {/if}
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="outline" onclick={closeCreateDialog}>Done</Button>
        </div>
      {:else}
        <h3 class="text-lg font-semibold text-foreground">Onboard Viber</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          Create a viber and get the connection command.
        </p>
        <div class="mt-4 space-y-2">
          <label for="new-viber-name" class="text-xs text-muted-foreground"
            >Viber name</label
          >
          <input
            id="new-viber-name"
            type="text"
            class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            bind:value={newViberName}
          />
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onclick={closeCreateDialog}
          >
            Cancel
          </Button>
          <Button disabled={creating} onclick={createViber}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      {/if}
    </div>
  </div>
{/if}
