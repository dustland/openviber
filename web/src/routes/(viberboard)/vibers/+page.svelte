<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    RefreshCw,
    Circle,
    Plus,
    Server,
    Archive,
    LoaderCircle,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import {
    getVibersStore,
    type ViberListItem,
  } from "$lib/stores/vibers";

  const vibersStore = getVibersStore();
  let hubConnected = $state(false);
  let showArchived = $state(false);
  const vibersState = $derived($vibersStore);
  const listMatchesFilter = $derived(
    vibersState.includeArchived === showArchived,
  );
  const vibers = $derived(
    listMatchesFilter ? (vibersState.vibers as ViberListItem[]) : [],
  );
  const loading = $derived(
    vibersState.loading || !listMatchesFilter,
  );

  async function fetchHubStatus() {
    try {
      const hubResponse = await fetch("/api/hub");
      const hubStatus = await hubResponse.json();
      hubConnected = hubStatus.connected;
    } catch {
      hubConnected = false;
    }
  }

  const busyViberIds = $state<Set<string>>(new Set());

  async function archiveViber(viberId: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busyViberIds.has(viberId)) return;
    busyViberIds.add(viberId);
    try {
      const response = await fetch(`/api/vibers/${viberId}/archive`, {
        method: "POST",
      });
      if (response.ok) {
        await vibersStore.invalidate();
      }
    } catch (error) {
      console.error("Failed to archive viber:", error);
    } finally {
      busyViberIds.delete(viberId);
    }
  }

  function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function statusColor(status: string): string {
    switch (status) {
      case "running":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      case "stopped":
        return "bg-zinc-400";
      default:
        return "bg-amber-500";
    }
  }

  $effect(() => {
    showArchived;
    void vibersStore.getVibers(showArchived);
  });

  onMount(() => {
    void vibersStore.getVibers(showArchived);
    void fetchHubStatus();

    const interval = setInterval(() => {
      void vibersStore.getVibers(showArchived);
      void fetchHubStatus();
    }, 10000);

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
      <p class="text-sm mt-0.5 text-muted-foreground flex items-center gap-2">
        {#if hubConnected}
          <span class="flex items-center gap-1">
            <Circle class="size-2 fill-green-500 text-green-500" />
            Hub connected
          </span>
          · {vibers.length} viber{vibers.length !== 1 ? "s" : ""}
        {:else}
          <span class="flex items-center gap-1">
            <Circle class="size-2 fill-red-500 text-red-500" />
            Hub disconnected
          </span>
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant={showArchived ? "secondary" : "outline"}
        size="sm"
        onclick={() => (showArchived = !showArchived)}
      >
        <Archive class="size-4 mr-1" />
        {showArchived ? "Hide Archived" : "Show Archived"}
      </Button>
      <Button variant="outline" size="sm" href="/vibers/new">
        <Plus class="size-4 mr-1" />
        New Viber
      </Button>
      <Button
        variant="outline"
        size="icon"
        onclick={() => {
          void vibersStore.refresh(showArchived);
        }}
      >
        <RefreshCw class="size-4" />
      </Button>
    </div>
  </div>

  <!-- Loading -->
  {#if loading}
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {#each Array(6) as _}
        <div class="rounded-xl border border-border bg-card p-4 space-y-3">
          <div class="flex items-start gap-3">
            <Skeleton class="size-9 rounded-lg shrink-0" />
            <div class="flex-1 space-y-2">
              <Skeleton class="h-4 w-3/4" />
              <Skeleton class="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-2/3" />
          <div class="flex items-center justify-between pt-1">
            <Skeleton class="h-5 w-16 rounded-full" />
            <Skeleton class="h-3 w-20" />
          </div>
        </div>
      {/each}
    </div>
  {:else if vibers.length > 0}
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {#each vibers as viber (viber.id)}
        <a href={`/vibers/${viber.id}`} class="block group/card">
          <Card
            class="overflow-hidden hover:shadow-md transition-shadow cursor-pointer {viber.archivedAt
              ? 'opacity-60'
              : ''}"
          >
            <CardHeader class="pb-3 overflow-hidden">
              <div class="flex items-start gap-3 min-w-0">
                <div
                  class="size-2.5 mt-1.5 shrink-0 rounded-full {statusColor(
                    viber.status,
                  )}"
                ></div>
                <div class="min-w-0 flex-1 overflow-hidden">
                  <CardTitle class="text-sm font-medium leading-snug truncate">
                    {viber.goal || viber.id}
                  </CardTitle>
                  <CardDescription class="text-xs mt-1 truncate">
                    <Badge
                      variant="outline"
                      class="text-[10px] px-1.5 py-0 mr-1"
                      >{viber.archivedAt ? "archived" : viber.status}</Badge
                    >
                    {#if viber.nodeName}
                      <span class="text-muted-foreground/60"
                        >· {viber.nodeName}</span
                      >
                    {/if}
                    {#if viber.createdAt}
                      · {formatTimeAgo(viber.createdAt)}
                    {/if}
                  </CardDescription>
                </div>
                {#if !viber.archivedAt}
                  <div
                    class="shrink-0 transition-opacity {busyViberIds.has(viber.id) ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7"
                      title="Archive viber"
                      disabled={busyViberIds.has(viber.id)}
                      onclick={(e: MouseEvent) => archiveViber(viber.id, e)}
                    >
                      {#if busyViberIds.has(viber.id)}
                        <LoaderCircle class="size-3.5 animate-spin" />
                      {:else}
                        <Archive class="size-3.5" />
                      {/if}
                    </Button>
                  </div>
                {/if}
              </div>
            </CardHeader>
          </Card>
        </a>
      {/each}
    </div>
  {:else if !hubConnected}
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <Server class="size-12 mb-4 text-muted-foreground/50" />
      <p class="text-lg font-medium text-muted-foreground">Hub Not Connected</p>
      <p class="text-sm mt-2 max-w-md text-muted-foreground">
        The viber hub server is not running. Start it with:
      </p>
      <div class="mt-6 p-4 bg-muted rounded-lg text-left max-w-md">
        <p class="text-sm font-mono text-muted-foreground">
          # Start everything together<br />
          pnpm dev
        </p>
      </div>
    </div>
  {:else}
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <Server class="size-12 mb-4 text-muted-foreground/50" />
      <p class="text-lg font-medium text-muted-foreground">No Vibers Yet</p>
      <p class="text-sm mt-2 max-w-md text-muted-foreground">
        Create a new viber from the
        <a href="/vibers/new" class="text-primary hover:underline">New Viber</a>
        page to get started.
      </p>
    </div>
  {/if}
</div>
