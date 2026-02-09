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
    ArchiveRestore,
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

  interface Viber {
    id: string;
    nodeId: string | null;
    nodeName: string | null;
    goal: string;
    status: string;
    createdAt: string | null;
    completedAt: string | null;
    /** Connection status of the node hosting this viber; null if no node */
    nodeConnected: boolean | null;
    archivedAt: string | null;
  }

  let vibers = $state<Viber[]>([]);
  let loading = $state(true);
  let hubConnected = $state(false);
  let showArchived = $state(false);

  async function fetchVibers() {
    try {
      const hubResponse = await fetch("/api/hub");
      const hubStatus = await hubResponse.json();
      hubConnected = hubStatus.connected;

      if (hubConnected) {
        const params = showArchived ? "?include_archived=true" : "";
        const response = await fetch(`/api/vibers${params}`);
        const data = await response.json();
        vibers = Array.isArray(data) ? data : [];
      } else {
        vibers = [];
      }
    } catch (error) {
      console.error("Failed to fetch vibers:", error);
      hubConnected = false;
      vibers = [];
    }
  }

  async function archiveViber(viberId: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const response = await fetch(`/api/vibers/${viberId}/archive`, {
        method: "POST",
      });
      if (response.ok) {
        await fetchVibers();
      }
    } catch (error) {
      console.error("Failed to archive viber:", error);
    }
  }

  async function restoreViber(viberId: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const response = await fetch(`/api/vibers/${viberId}/archive`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchVibers();
      }
    } catch (error) {
      console.error("Failed to restore viber:", error);
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
    // Re-fetch when showArchived changes
    showArchived;
    fetchVibers();
  });

  onMount(() => {
    fetchVibers().finally(() => (loading = false));

    const interval = setInterval(() => {
      fetchVibers();
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
          fetchVibers();
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
        <a href="/vibers/{viber.id}" class="block group/card">
          <Card
            class="hover:shadow-md transition-shadow cursor-pointer {viber.archivedAt
              ? 'opacity-60'
              : ''}"
          >
            <CardHeader class="pb-3">
              <div class="flex items-start gap-3">
                <div
                  class="size-2.5 mt-1.5 shrink-0 rounded-full {statusColor(
                    viber.status,
                  )}"
                ></div>
                <div class="min-w-0 flex-1">
                  <CardTitle class="text-sm font-medium leading-snug">
                    {viber.goal || viber.id}
                  </CardTitle>
                  <CardDescription class="text-xs mt-1">
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
                <div
                  class="shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity"
                >
                  {#if viber.archivedAt}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7"
                      title="Restore viber"
                      onclick={(e: MouseEvent) => restoreViber(viber.id, e)}
                    >
                      <ArchiveRestore class="size-3.5" />
                    </Button>
                  {:else}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7"
                      title="Archive viber"
                      onclick={(e: MouseEvent) => archiveViber(viber.id, e)}
                    >
                      <Archive class="size-3.5" />
                    </Button>
                  {/if}
                </div>
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
