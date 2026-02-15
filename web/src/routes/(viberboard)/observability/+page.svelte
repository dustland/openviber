<script lang="ts">
  import { onMount } from "svelte";
  import {
    Logs,
    Activity,
    Server,
    AlertCircle,
    AlertTriangle,
    Info,
    Search,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Loader2,
    Cpu,
    Wrench,
    CalendarClock,
    Radio,
  } from "@lucide/svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";

  // ── Types ──────────────────────────────────────────────────────────────────

  interface LogRow {
    id: string;
    level: string;
    category: string;
    component: string;
    message: string;
    viber_id: string | null;
    task_id: string | null;
    daemon_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    source: "db" | "hub";
  }

  type Tab = "activity" | "system";
  type Level = "info" | "warn" | "error";

  // ── State ──────────────────────────────────────────────────────────────────

  let loading = $state(true);
  let logs = $state<LogRow[]>([]);
  let error = $state<string | null>(null);
  let activeTab = $state<Tab>("activity");
  let activeLevels = $state<Set<Level>>(new Set(["info", "warn", "error"]));
  let searchQuery = $state("");
  let expandedIds = $state<Set<string>>(new Set());
  let hasMore = $state(false);
  let loadingMore = $state(false);
  let autoRefresh = $state(true);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchLogs(append = false) {
    if (!append) loading = true;
    else loadingMore = true;
    error = null;

    try {
      const params = new URLSearchParams();
      params.set("category", activeTab);
      params.set("level", Array.from(activeLevels).join(","));
      params.set("limit", "100");
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (append && logs.length > 0) {
        params.set("before", logs[logs.length - 1].created_at);
      }

      const res = await fetch(`/api/logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (append) {
        const existingIds = new Set(logs.map((l) => l.id));
        const newLogs = (data.logs as LogRow[]).filter(
          (l) => !existingIds.has(l.id),
        );
        logs = [...logs, ...newLogs];
      } else {
        logs = data.logs as LogRow[];
      }
      hasMore = data.hasMore ?? false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch logs";
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function loadMore() {
    fetchLogs(true);
  }

  // ── Auto-refresh ───────────────────────────────────────────────────────────

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshInterval = setInterval(() => {
      if (autoRefresh && !loading && !loadingMore) {
        fetchLogs();
      }
    }, 5000);
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onMount(() => {
    fetchLogs();
    startAutoRefresh();
    return () => stopAutoRefresh();
  });

  // Re-fetch when tab or filters change
  $effect(() => {
    // Capture dependencies
    void activeTab;
    void activeLevels;
    // Don't re-fetch on search change here (handled by search input)
    fetchLogs();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleLevel(level: Level) {
    const next = new Set(activeLevels);
    if (next.has(level)) {
      if (next.size > 1) next.delete(level);
    } else {
      next.add(level);
    }
    activeLevels = next;
  }

  function toggleExpanded(id: string) {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedIds = next;
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function getComponentIcon(component: string) {
    switch (component) {
      case "task":
        return Cpu;
      case "viber":
        return Server;
      case "skill":
        return Wrench;
      case "job":
        return CalendarClock;
      case "hub":
        return Radio;
      default:
        return Activity;
    }
  }

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchQuery = value;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => fetchLogs(), 300);
  }

  const filteredLogs = $derived(logs);
</script>

<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="border-b border-border px-4 py-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <Logs class="size-5 text-muted-foreground" />
        <div>
          <h1 class="text-lg font-semibold text-foreground">Observability</h1>
          <p class="text-sm text-muted-foreground">
            Real-time activity and system events
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => {
            autoRefresh = !autoRefresh;
            if (autoRefresh) startAutoRefresh();
            else stopAutoRefresh();
          }}
          class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {autoRefresh
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'}"
          title={autoRefresh ? "Auto-refresh ON (5s)" : "Auto-refresh OFF"}
        >
          <RefreshCw
            class="size-3 {autoRefresh ? 'animate-spin' : ''}"
            style={autoRefresh ? "animation-duration: 3s" : ""}
          />
          Live
        </button>
        <button
          type="button"
          onclick={() => fetchLogs()}
          disabled={loading}
          class="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {#if loading}
            <Loader2 class="size-3 animate-spin" />
          {:else}
            <RefreshCw class="size-3" />
          {/if}
          Refresh
        </button>
      </div>
    </div>

    <!-- Tabs + Filters -->
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <!-- Tab switcher -->
      <div class="flex gap-1 rounded-lg bg-muted/50 p-1">
        <button
          type="button"
          onclick={() => (activeTab = "activity")}
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
          'activity'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'}"
        >
          <Activity class="size-3.5" />
          Activity
        </button>
        <button
          type="button"
          onclick={() => (activeTab = "system")}
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
          'system'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'}"
        >
          <Server class="size-3.5" />
          System
        </button>
      </div>

      <div class="flex items-center gap-2">
        <!-- Level filters -->
        <div class="flex gap-1">
          <button
            type="button"
            onclick={() => toggleLevel("info")}
            class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors {activeLevels.has(
              'info',
            )
              ? 'border-blue-400/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
              : 'border-border text-muted-foreground/50'}"
          >
            <Info class="size-3" />
            Info
          </button>
          <button
            type="button"
            onclick={() => toggleLevel("warn")}
            class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors {activeLevels.has(
              'warn',
            )
              ? 'border-yellow-400/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
              : 'border-border text-muted-foreground/50'}"
          >
            <AlertTriangle class="size-3" />
            Warn
          </button>
          <button
            type="button"
            onclick={() => toggleLevel("error")}
            class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors {activeLevels.has(
              'error',
            )
              ? 'border-red-400/30 bg-red-500/10 text-red-600 dark:text-red-400'
              : 'border-border text-muted-foreground/50'}"
          >
            <AlertCircle class="size-3" />
            Error
          </button>
        </div>

        <!-- Search -->
        <div class="relative">
          <Search
            class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            oninput={handleSearchInput}
            class="h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Log entries -->
  <div
    class="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 lg:px-8"
  >
    {#if loading && logs.length === 0}
      <!-- Skeleton loading -->
      <div class="space-y-2">
        {#each Array(8) as _}
          <div
            class="flex items-start gap-3 rounded-lg border border-border/50 p-3"
          >
            <Skeleton class="h-5 w-5 rounded" />
            <div class="flex-1 space-y-2">
              <Skeleton class="h-4 w-3/4" />
              <Skeleton class="h-3 w-1/3" />
            </div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle class="size-10 text-destructive/60 mb-3" />
        <p class="text-sm font-medium text-destructive">{error}</p>
        <button
          type="button"
          onclick={() => fetchLogs()}
          class="mt-3 text-sm text-muted-foreground hover:text-foreground underline"
        >
          Try again
        </button>
      </div>
    {:else if filteredLogs.length === 0}
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <Logs class="size-10 text-muted-foreground/40 mb-3" />
        <p class="text-sm font-medium text-muted-foreground">No logs yet</p>
        <p class="text-xs text-muted-foreground/60 mt-1">
          {#if searchQuery}
            No logs match your search. Try a different query.
          {:else if activeTab === "activity"}
            Activity logs will appear when vibers start executing tasks.
          {:else}
            System logs will appear when vibers connect or disconnect.
          {/if}
        </p>
      </div>
    {:else}
      <div class="space-y-1">
        {#each filteredLogs as log (log.id)}
          {@const ComponentIcon = getComponentIcon(log.component)}
          {@const isExpanded = expandedIds.has(log.id)}
          {@const hasMetadata =
            log.metadata && Object.keys(log.metadata).length > 0}
          <div
            class="group rounded-lg border border-border/50 transition-colors hover:border-border hover:bg-muted/30 overflow-hidden"
          >
            <button
              type="button"
              onclick={() => hasMetadata && toggleExpanded(log.id)}
              class="flex w-full items-start gap-3 p-3 text-left max-w-full overflow-hidden"
              disabled={!hasMetadata}
              aria-label="Toggle log details"
            >
              <!-- Level indicator -->
              <div class="mt-0.5 shrink-0">
                {#if log.level === "error"}
                  <AlertCircle class="size-4 text-red-500 dark:text-red-400" />
                {:else if log.level === "warn"}
                  <AlertTriangle
                    class="size-4 text-yellow-500 dark:text-yellow-400"
                  />
                {:else}
                  <Info class="size-4 text-blue-500 dark:text-blue-400" />
                {/if}
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 overflow-hidden">
                <div class="flex items-center gap-2 min-w-0 overflow-hidden">
                  <!-- Component badge -->
                  <span
                    class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0"
                  >
                    <ComponentIcon class="size-2.5" />
                    {log.component}
                  </span>

                  <!-- Message -->
                  <span class="flex-1 text-sm text-foreground truncate min-w-0">
                    {log.message}
                  </span>
                </div>

                <!-- Context line -->
                <div
                  class="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground"
                >
                  <span title={formatTimestamp(log.created_at)}>
                    {relativeTime(log.created_at)}
                  </span>
                  {#if log.viber_id}
                    <span class="truncate max-w-[150px]" title={log.viber_id}>
                      viber: {log.viber_id.slice(0, 16)}...
                    </span>
                  {/if}
                  {#if log.daemon_id}
                    <span class="truncate max-w-[120px]" title={log.daemon_id}>
                      viber: {log.daemon_id.slice(0, 12)}...
                    </span>
                  {/if}
                  {#if log.source === "hub"}
                    <span
                      class="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary font-medium"
                    >
                      live
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Expand indicator -->
              {#if hasMetadata}
                <div class="mt-0.5 shrink-0 text-muted-foreground">
                  {#if isExpanded}
                    <ChevronDown class="size-4" />
                  {:else}
                    <ChevronRight class="size-4" />
                  {/if}
                </div>
              {/if}
            </button>

            <!-- Expanded metadata -->
            {#if isExpanded && hasMetadata}
              <div
                class="border-t border-border/50 bg-muted/20 px-3 py-2 text-xs"
              >
                <pre
                  class="overflow-x-auto whitespace-pre-wrap break-all font-mono text-muted-foreground">{JSON.stringify(
                    log.metadata,
                    null,
                    2,
                  )}</pre>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Load more -->
      {#if hasMore}
        <div class="flex justify-center py-4">
          <button
            type="button"
            onclick={loadMore}
            disabled={loadingMore}
            class="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {#if loadingMore}
              <Loader2 class="size-4 animate-spin" />
              Loading...
            {:else}
              Load more
            {/if}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>
