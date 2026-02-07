<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import {
    RefreshCw,
    Circle,
    SendHorizontal,
    AlertTriangle,
    Server,
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
  import ViberAvatar from "$lib/components/icons/ViberAvatar.svelte";

  interface Viber {
    id: string;
    name: string;
    platform: string | null;
    version: string | null;
    capabilities: string[] | null;
    isConnected: boolean;
    connectedAt: string | null;
    runningTasks: number;
  }

  let vibers = $state<Viber[]>([]);
  let loading = $state(true);
  let hubConnected = $state(false);
  let viberConfigErrors = $state<Record<string, string>>({});

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

  async function checkViberConfigs(viberList: Viber[]) {
    const errors: Record<string, string> = {};
    await Promise.all(
      viberList.map(async (v) => {
        try {
          const res = await fetch(`/api/vibers/${v.id}/config`);
          const data = await res.json();
          if (data.error) {
            errors[v.id] = data.error;
          }
        } catch {
          // Ignore fetch errors for config check
        }
      }),
    );
    viberConfigErrors = errors;
  }

  function formatPlatform(platform: string | null): string {
    switch (platform) {
      case "darwin":
        return "macOS";
      case "linux":
        return "Linux";
      case "win32":
        return "Windows";
      default:
        return platform || "Unknown";
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

  onMount(() => {
    fetchVibers()
      .then(() => checkViberConfigs(vibers))
      .finally(() => (loading = false));

    const interval = setInterval(() => {
      fetchVibers().then(() => checkViberConfigs(vibers));
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
          · {vibers.length} viber{vibers.length !== 1 ? "s" : ""} online
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
        variant="outline"
        size="icon"
        onclick={() => {
          fetchVibers().then(() => checkViberConfigs(vibers));
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
    <!-- Connected Vibers (live from hub) -->
    <div>
      <h2
        class="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3"
      >
        Connected Vibers
      </h2>
      <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {#each vibers as viber (viber.id)}
          {@const hasConfigError = !!viberConfigErrors[viber.id]}
          <a href="/vibers/{viber.id}" class="block">
            <Card
              class="hover:shadow-md transition-shadow cursor-pointer {hasConfigError
                ? 'border-amber-500/40'
                : ''}"
            >
              <CardHeader class="pb-3">
                <div class="flex items-start gap-3">
                  <div
                    class="size-10 rounded-lg flex items-center justify-center shrink-0 {hasConfigError
                      ? 'bg-amber-500/10'
                      : 'bg-primary/10'}"
                  >
                    {#if hasConfigError}
                      <AlertTriangle class="size-5 text-amber-500" />
                    {:else}
                      <ViberAvatar class="size-6 text-primary" />
                    {/if}
                  </div>
                  <div class="min-w-0 flex-1">
                    <CardTitle class="flex items-center gap-2 text-base">
                      <span class="truncate">{viber.name}</span>
                      {#if hasConfigError}
                        <span
                          class="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-500"
                        ></span>
                      {:else}
                        <span
                          class="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500"
                        ></span>
                      {/if}
                    </CardTitle>
                    <CardDescription class="text-xs mt-0.5">
                      {#if hasConfigError}
                        <span class="text-amber-600 dark:text-amber-400"
                          >Needs setup</span
                        > ·
                      {/if}
                      {formatPlatform(viber.platform)}{#if viber.version}
                        · v{viber.version}{/if}
                      {#if viber.connectedAt}
                        · connected {formatTimeAgo(viber.connectedAt)}
                      {/if}
                    </CardDescription>
                  </div>
                  <SendHorizontal
                    class="size-4 text-muted-foreground/50 shrink-0 mt-1"
                  />
                </div>
              </CardHeader>
              {#if (viber.capabilities && viber.capabilities.length > 0) || viber.runningTasks > 0}
                <CardContent class="pt-0 pb-3">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#if viber.capabilities}
                      {#each viber.capabilities as cap}
                        <Badge variant="outline" class="text-[11px] px-1.5 py-0"
                          >{cap}</Badge
                        >
                      {/each}
                    {/if}
                    {#if viber.runningTasks > 0}
                      <Badge
                        variant="default"
                        class="text-[11px] bg-blue-500/20 text-blue-700 dark:text-blue-400 border-0 px-1.5 py-0"
                      >
                        {viber.runningTasks} task{viber.runningTasks > 1
                          ? "s"
                          : ""}
                      </Badge>
                    {/if}
                  </div>
                </CardContent>
              {/if}
            </Card>
          </a>
        {/each}
      </div>
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
          <p class="text-lg font-medium">No Vibers Connected</p>
          <p class="text-sm mt-2 max-w-md mx-auto">
            No vibers are currently connected to the hub. Register a node from
            the <a href="/nodes" class="text-primary hover:underline">Nodes</a> page
            and start a viber daemon.
          </p>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
