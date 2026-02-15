<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    RefreshCw,
    Circle,
    Plus,
    Server,
    Archive,
    LoaderCircle,
    MessageSquarePlus,
    FolderGit2,
    Check,
    ChevronDown,
    Package,
  } from "@lucide/svelte";
  import ViberIcon from "$lib/components/icons/viber-icon.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { getTasksStore, type TaskListItem } from "$lib/stores/tasks";
  import TaskStepIndicator from "$lib/components/vibers/task-step-indicator.svelte";
  import ChatComposer from "$lib/components/chat-composer.svelte";
  import type {
    ComposerViber,
    ComposerEnvironment,
    ComposerSkill,
  } from "$lib/components/chat-composer.svelte";

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

  // -- Composer state (for empty-state new task) --
  let vibers = $state<ComposerViber[]>([]);
  let environments = $state<ComposerEnvironment[]>([]);
  let composerSkills = $state<ComposerSkill[]>([]);
  let selectedViberId = $state<string | null>(null);
  let selectedEnvironmentId = $state<string | null>(null);
  let selectedModelId = $state("");
  let selectedSkillIds = $state<string[]>([]);
  let taskInput = $state("");
  let creating = $state(false);
  let composerError = $state<string | null>(null);

  const activeVibers = $derived(vibers.filter((v) => v.status === "active"));
  const selectedViber = $derived(
    vibers.find((v) => v.id === selectedViberId) ?? null,
  );
  const selectedEnvironment = $derived(
    environments.find((e) => e.id === selectedEnvironmentId) ?? null,
  );

  async function fetchGatewayStatus() {
    try {
      const gatewayResponse = await fetch("/api/gateway");
      const gatewayStatus = await gatewayResponse.json();
      gatewayConnected = gatewayStatus.connected;
    } catch {
      gatewayConnected = false;
    }
  }

  async function fetchComposerData() {
    try {
      const [nodesRes, envsRes, settingsRes, skillsRes] = await Promise.all([
        fetch("/api/vibers"),
        fetch("/api/environments"),
        fetch("/api/settings"),
        fetch("/api/skills"),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        vibers = (data.vibers ?? []).map((v: any) => ({
          id: v.id,
          name: v.name,
          viber_id: v.viber_id ?? null,
          status: v.status ?? "offline",
        }));

        // Extract skills from connected vibers as a fallback
        // in case /api/skills (Supabase) has no data yet.
        const viberSkills: ComposerSkill[] = [];
        const seen = new Set<string>();
        for (const v of data.vibers ?? []) {
          for (const s of v.skills ?? []) {
            const id = s.id || s.name;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            viberSkills.push({
              id,
              name: s.name || id,
              description: s.description || "",
            });
          }
        }

        // Use viber-reported skills as fallback
        if (viberSkills.length > 0 && composerSkills.length === 0) {
          composerSkills = viberSkills;
        }
      }

      if (envsRes.ok) {
        const data = await envsRes.json();
        environments = data.environments ?? [];
      }

      if (skillsRes.ok) {
        const data = await skillsRes.json();
        const supabaseSkills = (data.skills ?? []).map(
          (s: { id: string; name: string; description?: string }) => ({
            id: s.id,
            name: s.name,
            description: s.description || "",
          }),
        );
        // Only replace if Supabase actually has skills
        if (supabaseSkills.length > 0) {
          composerSkills = supabaseSkills;
        }
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.chatModel && !selectedModelId) {
          selectedModelId = data.chatModel;
        }
      }

      if (activeVibers.length === 1 && !selectedViberId) {
        selectedViberId = activeVibers[0].id;
      }
      if (environments.length === 1 && !selectedEnvironmentId) {
        selectedEnvironmentId = environments[0].id;
      }
    } catch {
      /* non-critical */
    }
  }

  async function submitTask() {
    const content = taskInput.trim();
    const viber = vibers.find((v) => v.id === selectedViberId);

    if (!content) {
      composerError = "Describe what you want to accomplish.";
      return;
    }
    if (creating) return;

    if (!viber || viber.status !== "active") {
      composerError =
        activeVibers.length > 0
          ? "Select an active viber to start this task."
          : "No active viber found. Start a viber first, then retry.";
      return;
    }

    creating = true;
    composerError = null;

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: content,
          viberId: viber.viber_id ?? undefined,
          environmentId: selectedEnvironmentId ?? undefined,
          model: selectedModelId || undefined,
          skills: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create task.");
      }

      const taskId = payload.viberId ?? payload.taskId;
      void getTasksStore().invalidate();

      window.sessionStorage.setItem(
        `openviber:new-viber-task:${taskId}`,
        content,
      );

      await goto(`/tasks/${taskId}`);
    } catch (submitError) {
      composerError =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create task.";
      creating = false;
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

  onMount(() => {
    void tasksStore.getTasks(showArchived);
    void fetchGatewayStatus();
    void fetchComposerData();

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
  <div class="flex items-center justify-between mb-6">
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
    <div class="flex items-center gap-2">
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
        href="/"
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
  {:else}
    <div class="flex-1 flex flex-col items-center justify-center">
      <div class="w-full max-w-xl text-center">
        <MessageSquarePlus
          class="size-10 mx-auto mb-3 text-muted-foreground/40"
        />
        <p class="text-lg font-medium text-foreground mb-1">No tasks yet</p>
        <p class="text-sm text-muted-foreground mb-6">
          Describe what you'd like to accomplish and a viber will get to work.
        </p>

        <!-- Viber & Environment selectors -->
        <div class="mb-3 flex flex-wrap items-center gap-2 justify-center">
          {#if vibers.length > 0}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
              >
                {#if selectedViber}
                  <span
                    class="inline-block size-2 shrink-0 rounded-full"
                    class:bg-emerald-500={selectedViber.status === "active"}
                    class:bg-amber-500={selectedViber.status === "pending"}
                    class:bg-zinc-400={selectedViber.status === "offline"}
                  ></span>
                  <span class="truncate max-w-[140px]"
                    >{selectedViber.name}</span
                  >
                {:else}
                  <ViberIcon class="size-3.5" />
                  <span>Viber</span>
                {/if}
                <ChevronDown class="size-3 opacity-50" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="w-64">
                <DropdownMenu.Label>Select viber</DropdownMenu.Label>
                <DropdownMenu.Separator />
                {#each vibers as viber (viber.id)}
                  <DropdownMenu.Item
                    onclick={() => (selectedViberId = viber.id)}
                    class="flex items-center gap-2"
                    disabled={viber.status !== "active"}
                  >
                    <span class="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        class="inline-block size-2 shrink-0 rounded-full"
                        class:bg-emerald-500={viber.status === "active"}
                        class:bg-amber-500={viber.status === "pending"}
                        class:bg-zinc-400={viber.status === "offline"}
                      ></span>
                      {viber.name}
                      {#if viber.status !== "active"}
                        <span class="text-xs text-muted-foreground ml-1"
                          >({viber.status})</span
                        >
                      {/if}
                    </span>
                    {#if selectedViberId === viber.id}
                      <Check class="size-3.5 text-primary" />
                    {/if}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {/if}

          {#if environments.length > 0}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
              >
                <FolderGit2 class="size-3.5" />
                {#if selectedEnvironment}
                  <span class="truncate max-w-[140px]"
                    >{selectedEnvironment.name}</span
                  >
                {:else}
                  <span>Env</span>
                {/if}
                <ChevronDown class="size-3 opacity-50" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="w-56">
                <DropdownMenu.Label>Select environment</DropdownMenu.Label>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onclick={() => (selectedEnvironmentId = null)}
                  class="flex items-center justify-between"
                >
                  <span class="flex items-center gap-2">
                    <Package class="size-4 opacity-60" />
                    All environments
                  </span>
                  {#if selectedEnvironmentId === null}
                    <Check class="size-3.5 text-primary" />
                  {/if}
                </DropdownMenu.Item>
                {#each environments as env (env.id)}
                  <DropdownMenu.Item
                    onclick={() => (selectedEnvironmentId = env.id)}
                    class="flex items-center justify-between"
                  >
                    <span class="flex items-center gap-2">
                      <FolderGit2 class="size-4 opacity-60" />
                      {env.name}
                    </span>
                    {#if selectedEnvironmentId === env.id}
                      <Check class="size-3.5 text-primary" />
                    {/if}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {/if}
        </div>
        <ChatComposer
          bind:value={taskInput}
          bind:error={composerError}
          bind:selectedModelId
          bind:selectedSkillIds
          placeholder="What would you like to work on?"
          disabled={creating}
          sending={creating}
          skills={composerSkills}
          onsubmit={() => void submitTask()}
        />
      </div>
    </div>
  {/if}
</div>
