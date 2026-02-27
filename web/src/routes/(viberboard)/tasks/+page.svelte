<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
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
  } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { getTasksStore, type TaskListItem } from "$lib/stores/tasks";
  import TaskStepIndicator from "$lib/components/vibers/task-step-indicator.svelte";

  const tasksStore = getTasksStore();
  let gatewayConnected = $state(false);
  let showArchived = $state(false);
  const tasksState = $derived($tasksStore);
  const listMatchesFilter = $derived(
    tasksState.includeArchived === showArchived,
  );
  const tasks = $derived(
    listMatchesFilter ? (tasksState.tasks as TaskListItem[]) : [],
  );
  const loading = $derived(tasksState.loading || !listMatchesFilter);

  async function fetchGatewayStatus() {
    try {
      const gatewayResponse = await fetch("/api/gateway");
      const gatewayStatus = await gatewayResponse.json();
      gatewayConnected = gatewayStatus.connected;
    } catch {
      gatewayConnected = false;
    }
  }

  const busyViberIds = $state<Set<string>>(new Set());

  async function archiveViber(viberId: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busyViberIds.has(viberId)) return;
    busyViberIds.add(viberId);
    try {
      const response = await fetch(`/api/tasks/${viberId}/archive`, {
        method: "POST",
      });
      if (response.ok) {
        await tasksStore.invalidate();
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
    void tasksStore.getTasks(showArchived);
  });

  // Redirect to /tasks/new when task list is empty
  $effect(() => {
    if (!loading && !showArchived && tasks.length === 0 && gatewayConnected) {
      void goto("/tasks/new", { replaceState: true });
    }
  });

  onMount(() => {
    void tasksStore.getTasks(showArchived);
    void fetchGatewayStatus();

    const interval = setInterval(() => {
      void tasksStore.getTasks(showArchived);
      void fetchGatewayStatus();
    }, 10000);

    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>Tasks - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto flex flex-col">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold text-foreground">Tasks</h1>
      <p class="text-sm mt-0.5 text-muted-foreground flex items-center gap-2">
        {#if gatewayConnected}
          <span class="flex items-center gap-1">
            <Circle class="size-2 fill-green-500 text-green-500" />
            Gateway connected
          </span>
          · {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        {:else}
          <span class="flex items-center gap-1">
            <Circle class="size-2 fill-red-500 text-red-500" />
            Gateway disconnected
          </span>
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-normal">
      <Button
        variant={showArchived ? "secondary" : "outline"}
        size="sm"
        class="gap-2"
        aria-label={showArchived
          ? "Hide archived tasks"
          : "Show archived tasks"}
        title={showArchived ? "Hide archived tasks" : "Show archived tasks"}
        onclick={() => (showArchived = !showArchived)}
      >
        <Archive class="size-4" />
        <span class="hidden sm:inline"
          >{showArchived ? "Hide Archived" : "Show Archived"}</span
        >
      </Button>
      <Button
        variant="outline"
        size="sm"
        href="/tasks/new"
        class="gap-2"
        title="New Task"
      >
        <Plus class="size-4" />
        <span class="hidden sm:inline">New Task</span>
      </Button>
      <Button
        variant="outline"
        size="icon"
        onclick={() => {
          void tasksStore.refresh(showArchived);
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
  {:else if tasks.length > 0}
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {#each tasks as task (task.id)}
        <a href={`/tasks/${task.id}`} class="block group/card">
          <Card
            class="overflow-hidden hover:shadow-md transition-shadow cursor-pointer {task.archivedAt
              ? 'opacity-60'
              : ''}"
          >
            <CardHeader class="pb-3 overflow-hidden">
              <div class="flex items-start gap-3 min-w-0">
                <div
                  class="size-2.5 mt-1.5 shrink-0 rounded-full {statusColor(
                    task.status,
                  )}"
                ></div>
                <div class="min-w-0 flex-1 overflow-hidden">
                  <CardTitle class="text-sm font-medium leading-snug truncate">
                    {task.goal || task.id}
                  </CardTitle>
                  <TaskStepIndicator
                    status={task.status}
                    archived={Boolean(task.archivedAt)}
                  />
                  <CardDescription class="text-xs mt-1 truncate">
                    <Badge
                      variant="outline"
                      class="text-[10px] px-1.5 py-0 mr-1"
                      >{task.archivedAt ? "archived" : task.status}</Badge
                    >
                    {#if task.viberName}
                      <span class="text-muted-foreground/60"
                        >· {task.viberName}</span
                      >
                    {/if}
                    {#if task.createdAt}
                      · {formatTimeAgo(task.createdAt)}
                    {/if}
                  </CardDescription>
                </div>
                {#if !task.archivedAt}
                  <div
                    class="shrink-0 transition-opacity {busyViberIds.has(
                      task.id,
                    )
                      ? 'opacity-100'
                      : 'opacity-0 group-hover/card:opacity-100'}"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7"
                      title="Archive task"
                      disabled={busyViberIds.has(task.id)}
                      onclick={(e: MouseEvent) => archiveViber(task.id, e)}
                    >
                      {#if busyViberIds.has(task.id)}
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
  {:else if !gatewayConnected}
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <Server class="size-12 mb-4 text-muted-foreground/50" />
      <p class="text-lg font-medium text-muted-foreground">
        Gateway Not Connected
      </p>
      <p class="text-sm mt-2 max-w-md text-muted-foreground">
        The gateway server is not running. Start it with:
      </p>
      <div class="mt-6 p-4 bg-muted rounded-lg text-left max-w-md">
        <p class="text-sm font-mono text-muted-foreground">
          # Start everything together<br />
          pnpm dev
        </p>
      </div>
    </div>
  {/if}
</div>
