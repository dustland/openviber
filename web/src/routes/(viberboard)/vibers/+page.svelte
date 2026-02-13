<script lang="ts">
  import { onMount } from "svelte";
  import {
    Check,
    Clock,
    Copy,
    Cpu,
    Eye,
    MemoryStick,
    Plus,
    RefreshCw,
    Server,
    Trash2,
    Zap,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import NodeStatusPanel from "$lib/components/node-status-panel.svelte";
  import NodeDetailPanel from "$lib/components/node-detail-panel.svelte";

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
    // Enriched hub data
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
  let showCreateDialog = $state(false);
  let newViberName = $state("My Viber");
  let selectedViberId = $state<string | null>(null);
  let selectedViberName = $state<string>("");

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

  function statusDot(status: Viber["status"]) {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "pending":
        return "bg-amber-500";
      default:
        return "bg-gray-400";
    }
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
        showCreateDialog = false;
        newViberName = "My Viber";
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

  function openViberDetail(viber: Viber) {
    const effectiveId = viber.viber_id || viber.id;
    selectedViberId = effectiveId;
    selectedViberName = viber.name;
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
      return { label: "Config Failed", class: "bg-rose-500/10 text-rose-600" };
    }
    if (verified.length > 0 && failed.length === 0) {
      return {
        label: "Config Verified",
        class: "bg-emerald-500/10 text-emerald-600",
      };
    }
    if (syncState.lastConfigPullAt) {
      return {
        label: "Config Delivered",
        class: "bg-amber-500/10 text-amber-600",
      };
    }
    return { label: "Config Pending", class: "bg-muted text-muted-foreground" };
  }

  onMount(() => {
    loading = true;
    fetchVibers().finally(() => {
      loading = false;
    });

    // Auto-refresh every 30s
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
        <Plus class="size-4 mr-1" />
        Add Viber
      </Button>
      <Button variant="outline" size="icon" onclick={() => fetchVibers()}>
        <RefreshCw class="size-4" />
      </Button>
    </div>
  </div>

  {#if loading}
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each Array(3) as _}
        <div class="rounded-xl border border-border bg-card p-4 space-y-3">
          <div class="flex items-start justify-between">
            <div class="space-y-2 flex-1">
              <Skeleton class="h-4 w-2/3" />
              <Skeleton class="h-3 w-1/2" />
            </div>
            <Skeleton class="size-6 rounded-md shrink-0" />
          </div>
          <div class="space-y-2">
            <Skeleton class="h-1.5 w-full rounded-full" />
            <Skeleton class="h-1.5 w-full rounded-full" />
          </div>
          <Skeleton class="h-3 w-3/4" />
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
        <Plus class="size-4 mr-1" />
        Create Viber
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
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {#each activeVibers as viber (viber.id)}
            <Card
              class="group relative overflow-hidden transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <CardHeader class="pb-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <CardTitle class="flex items-center gap-2 text-base">
                      <span class="truncate">{viber.name}</span>
                      <span
                        class={`size-2 rounded-full ${statusDot(viber.status)} shrink-0`}
                      ></span>
                    </CardTitle>
                    <CardDescription class="text-xs mt-0.5 space-x-1">
                      {#if viber.version}
                        <span>v{viber.version}</span>
                        <span class="text-muted-foreground/40">·</span>
                      {/if}
                      {#if viber.platform}
                        <span>{viber.platform}</span>
                        <span class="text-muted-foreground/40">·</span>
                      {/if}
                      <span>created {formatTimeAgo(viber.created_at)}</span>
                    </CardDescription>
                    {#if getConfigSyncBadge(viber.config_sync_state)}
                      {@const badge = getConfigSyncBadge(
                        viber.config_sync_state,
                      )}
                      <div class="mt-1.5">
                        <span
                          class={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badge.class}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                    {/if}
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all"
                      onclick={() => openViberDetail(viber)}
                      title="View detailed status"
                    >
                      <Eye class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all"
                      onclick={() => deleteViber(viber.id)}
                      title="Delete viber"
                    >
                      <Trash2 class="size-4" />
                    </button>
                  </div>
                </div>

                <!-- Quick stats row -->
                {#if viber.machine || viber.viber}
                  <div class="flex items-center gap-3 mt-2 flex-wrap">
                    {#if viber.machine}
                      <span
                        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                        title="CPU Usage"
                      >
                        <Cpu class="size-3" />
                        <span
                          class="tabular-nums font-medium {viber.machine.cpu
                            .averageUsage >= 80
                            ? 'text-amber-500'
                            : 'text-foreground'}"
                        >
                          {viber.machine.cpu.averageUsage.toFixed(0)}%
                        </span>
                      </span>
                      <span
                        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                        title="Memory Usage"
                      >
                        <MemoryStick class="size-3" />
                        <span
                          class="tabular-nums font-medium {viber.machine.memory
                            .usagePercent >= 80
                            ? 'text-amber-500'
                            : 'text-foreground'}"
                        >
                          {viber.machine.memory.usagePercent.toFixed(0)}%
                        </span>
                      </span>
                    {/if}
                    {#if viber.viber}
                      <span
                        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                        title="Running Tasks"
                      >
                        <Zap class="size-3" />
                        <span
                          class="tabular-nums font-medium {viber.viber
                            .runningTaskCount > 0
                            ? 'text-emerald-500'
                            : 'text-foreground'}"
                        >
                          {viber.viber.runningTaskCount} tasks
                        </span>
                      </span>
                    {/if}
                    {#if viber.lastHeartbeat}
                      <span
                        class="text-[11px] text-muted-foreground/50 ml-auto"
                        title="Last heartbeat"
                      >
                        {formatTimeAgo(viber.lastHeartbeat)}
                      </span>
                    {/if}
                  </div>
                {/if}
              </CardHeader>
              <CardContent class="pt-0">
                <NodeStatusPanel
                  machine={viber.machine}
                  viber={viber.viber}
                  skills={viber.skills}
                  capabilities={viber.capabilities}
                  compact={true}
                />
              </CardContent>
            </Card>
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
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {#each inactiveVibers as viber (viber.id)}
            <Card class="group">
              <CardHeader class="pb-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <CardTitle class="flex items-center gap-2 text-base">
                      <span class="truncate">{viber.name}</span>
                      <span
                        class={`size-1.5 rounded-full ${statusDot(viber.status)}`}
                      ></span>
                    </CardTitle>
                    <CardDescription class="text-xs mt-0.5">
                      {statusLabel(viber.status)} · created {formatTimeAgo(
                        viber.created_at,
                      )}
                    </CardDescription>
                  </div>
                  <button
                    type="button"
                    class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                    onclick={() => deleteViber(viber.id)}
                    title="Delete viber"
                  >
                    <Trash2 class="size-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent class="pt-0 space-y-2">
                {#if viber.onboard_token}
                  <button
                    type="button"
                    class="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs hover:bg-muted transition-colors"
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
                  <p
                    class="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"
                  >
                    <Clock class="size-3" />
                    Token expires {new Date(
                      viber.token_expires_at,
                    ).toLocaleString()}
                  </p>
                {/if}
              </CardContent>
            </Card>
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
      <h3 class="text-lg font-semibold text-foreground">Create Viber</h3>
      <p class="mt-1 text-sm text-muted-foreground">
        Register a new machine for OpenViber.
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
          onclick={() => {
            showCreateDialog = false;
            newViberName = "My Viber";
          }}
        >
          Cancel
        </Button>
        <Button disabled={creating} onclick={createViber}>
          {creating ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  </div>
{/if}

<!-- Viber Detail Panel -->
{#if selectedViberId}
  {@const selectedViber = vibers.find((v) => v.id === selectedViberId)}
  <NodeDetailPanel
    nodeId={selectedViberId}
    nodeName={selectedViberName}
    configSyncState={selectedViber?.config_sync_state}
    onClose={() => {
      selectedViberId = null;
    }}
  />
{/if}
