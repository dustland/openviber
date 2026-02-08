<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { RefreshCw, Circle, Plus, Server } from "@lucide/svelte";
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
    goal: string;
    status: string;
    createdAt: string | null;
    completedAt: string | null;
    isConnected: boolean;
  }

  let vibers = $state<Viber[]>([]);
  let loading = $state(true);
  let hubConnected = $state(false);

  async function fetchVibers() {
    try {
      const hubResponse = await fetch("/api/hub");
      const hubStatus = await hubResponse.json();
      hubConnected = hubStatus.connected;

      if (hubConnected) {
        const response = await fetch("/api/vibers");
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

<div class="p-6 h-full overflow-y-auto">
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
    <div class="text-center py-12 text-muted-foreground">Loading...</div>
  {:else if vibers.length > 0}
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {#each vibers as viber (viber.id)}
        <a href="/vibers/{viber.id}" class="block">
          <Card class="hover:shadow-md transition-shadow cursor-pointer">
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
                      class="text-[10px] px-1.5 py-0 mr-1">{viber.status}</Badge
                    >
                    {#if viber.createdAt}
                      · {formatTimeAgo(viber.createdAt)}
                    {/if}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </a>
      {/each}
    </div>
  {:else if !hubConnected}
    <Card class="text-center py-12">
      <CardContent>
        <div class="mb-4 text-muted-foreground">
          <Server class="size-12 mx-auto mb-4 opacity-50" />
          <p class="text-lg font-medium">Hub Not Connected</p>
          <p class="text-sm mt-2 max-w-md mx-auto">
            The viber hub server is not running. Start it with:
          </p>
        </div>
        <div class="mt-6 p-4 bg-muted rounded-lg text-left max-w-md mx-auto">
          <p class="text-sm font-mono text-muted-foreground">
            # Start everything together<br />
            pnpm dev
          </p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <Card class="text-center py-12">
      <CardContent>
        <div class="mb-4 text-muted-foreground">
          <Server class="size-12 mx-auto mb-4 opacity-50" />
          <p class="text-lg font-medium">No Vibers Yet</p>
          <p class="text-sm mt-2 max-w-md mx-auto">
            Create a new viber from the
            <a href="/vibers/new" class="text-primary hover:underline"
              >New Viber</a
            >
            page to get started.
          </p>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
