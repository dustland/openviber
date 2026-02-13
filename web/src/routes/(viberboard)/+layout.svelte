<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import {
    AlertCircle,
    Archive,
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    Cpu,
    FolderGit2,
    LoaderCircle,
    Pin,
    Puzzle,
    Logs,
    Laptop,
    Wifi,
    WifiOff,
  } from "@lucide/svelte";
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import AppSidebar from "$lib/components/layout/app-sidebar.svelte";
  import { getTasksStore } from "$lib/stores/tasks";
  import { pinnedTasksStore } from "$lib/stores/pinned-tasks";

  interface SidebarTask {
    id: string;
    goal: string;
    viberId: string | null;
    viberName: string | null;
    environmentId: string | null;
    environmentName: string | null;
    status: string;
    createdAt: string | null;
    /** Connection status of the viber running this task; null if no viber */
    viberConnected: boolean | null;
  }

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "";
    // Supabase returns UTC timestamps without Z suffix; ensure UTC parsing
    const normalized = /[Z+-]/.test(dateStr.slice(-6))
      ? dateStr
      : dateStr + "Z";
    const diff = Date.now() - new Date(normalized).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
  }

  interface SidebarEnvironment {
    id: string;
    name: string;
  }

  interface TaskGroup {
    label: string;
    environmentId: string | null;
    tasks: SidebarTask[];
  }

  let { children } = $props();

  async function archiveTask(taskId: string) {
    try {
      const response = await fetch(`/api/tasks/${taskId}/archive`, {
        method: "POST",
      });
      if (response.ok) {
        await tasksStore.invalidate();
      }
    } catch (error) {
      console.error("Failed to archive task:", error);
    }
  }

  const tasksStore = getTasksStore();
  const tasksState = $derived($tasksStore);
  const tasks = $derived(tasksState.tasks as SidebarTask[]);
  let environments = $state<SidebarEnvironment[]>([]);

  const pinnedIds = $derived($pinnedTasksStore);

  const pinnedTasks = $derived(tasks.filter((t) => pinnedIds.has(t.id)));

  const unpinnedTaskGroups = $derived.by(() => {
    const groups = new Map<string, TaskGroup>();

    for (const task of tasks) {
      if (pinnedIds.has(task.id)) continue; // skip pinned
      const key = task.environmentId ?? "__unassigned__";
      if (!groups.has(key)) {
        groups.set(key, {
          label: task.environmentName ?? "Unassigned",
          environmentId: task.environmentId,
          tasks: [],
        });
      }
      groups.get(key)!.tasks.push(task);
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (!a.environmentId) return 1;
      if (!b.environmentId) return -1;
      return a.label.localeCompare(b.label);
    });
  });

  const allTasks = $derived(tasks);

  const pathname = $derived($page.url.pathname);
  const isTasksRoute = $derived(
    pathname === "/tasks" || pathname.startsWith("/tasks/"),
  );
  const isVibersRoute = $derived(
    pathname === "/vibers" || pathname.startsWith("/vibers/"),
  );
  const isEnvironmentsRoute = $derived(
    pathname === "/environments" || pathname.startsWith("/environments/"),
  );
  const isJobsRoute = $derived(
    pathname === "/jobs" || pathname.startsWith("/jobs/"),
  );
  const isSkillsRoute = $derived(
    pathname === "/skills" || pathname.startsWith("/skills/"),
  );
  const isLogsRoute = $derived(
    pathname === "/logs" || pathname.startsWith("/logs/"),
  );
  // Stories route removed — intents live inside /vibers/new and /settings/intents

  async function fetchEnvironments() {
    try {
      const response = await fetch("/api/environments");
      if (!response.ok) {
        environments = [];
        return;
      }
      const payload = await response.json();
      environments = Array.isArray(payload.environments)
        ? payload.environments.map((e: Record<string, unknown>) => ({
            id: String(e.id),
            name: String(e.name || "Unnamed"),
          }))
        : [];
    } catch (error) {
      console.error("Failed to fetch environments:", error);
      environments = [];
    }
  }

  onMount(() => {
    void tasksStore.getTasks();
    void fetchEnvironments();

    const interval = setInterval(() => {
      void tasksStore.getTasks();
      void fetchEnvironments();
    }, 5000);

    return () => clearInterval(interval);
  });
</script>

<AppSidebar>
  {#snippet sidebar()}
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={isTasksRoute} tooltipContent="Tasks">
              <a href="/tasks" class="w-full inline-flex items-center gap-2">
                <Cpu class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Tasks</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isVibersRoute}
              tooltipContent="Vibers"
            >
              <a href="/vibers" class="w-full inline-flex items-center gap-2">
                <Laptop class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Vibers</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isEnvironmentsRoute}
              tooltipContent="Environments"
            >
              <a
                href="/environments"
                class="w-full inline-flex items-center gap-2"
              >
                <FolderGit2 class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Environments</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={isJobsRoute} tooltipContent="Jobs">
              <a href="/jobs" class="w-full inline-flex items-center gap-2">
                <CalendarClock class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Jobs</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isSkillsRoute}
              tooltipContent="Skills"
            >
              <a href="/skills" class="w-full inline-flex items-center gap-2">
                <Puzzle class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Skills</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={isLogsRoute} tooltipContent="Logs">
              <a href="/logs" class="w-full inline-flex items-center gap-2">
                <Logs class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Logs</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if allTasks.length > 0}
      <Sidebar.Separator />

      <!-- Collapsed view: flat icon list with tooltips -->
      <Sidebar.Group class="hidden group-data-[collapsible=icon]:block">
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each allTasks as task (task.id)}
              {@const goalText = task.goal || task.id}
              {@const tooltipText =
                goalText.length > 120 ? goalText.slice(0, 117) + "…" : goalText}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={pathname.startsWith(`/tasks/${task.id}`)}
                  tooltipContent={tooltipText}
                  tooltipContentProps={{
                    class: "max-w-64 whitespace-normal text-xs leading-relaxed",
                  }}
                >
                  <a
                    href={`/tasks/${task.id}`}
                    class="w-full inline-flex items-center gap-2"
                  >
                    {#if task.status === "running"}
                      <LoaderCircle
                        class="size-4 shrink-0 animate-spin text-emerald-500"
                      />
                    {:else if task.status === "error"}
                      <AlertCircle class="size-4 shrink-0 text-red-500" />
                    {:else if task.status === "completed"}
                      <CheckCircle2 class="size-4 shrink-0 text-blue-500" />
                    {:else}
                      <Cpu class="size-4 shrink-0 text-muted-foreground" />
                    {/if}
                    <span class="truncate">{task.goal || task.id}</span>
                  </a>
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>

      <!-- Expanded view -->
      <Sidebar.Group class="group-data-[collapsible=icon]:hidden">
        <Sidebar.GroupLabel
          class="text-[10px] uppercase tracking-wider text-sidebar-foreground/55 px-2"
        >
          Tasks
        </Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <!-- Pinned tasks -->
            {#if pinnedTasks.length > 0}
              {#each pinnedTasks as task (task.id)}
                <Sidebar.MenuItem class="overflow-hidden">
                  <div class="group/taskrow relative flex w-full items-center">
                    <HoverCard.Root openDelay={400} closeDelay={100}>
                      <HoverCard.Trigger class="min-w-0 w-full">
                        <Sidebar.MenuButton
                          href={`/tasks/${task.id}`}
                          isActive={pathname.startsWith(`/tasks/${task.id}`)}
                          class="min-h-8 gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground pr-8 overflow-hidden"
                        >
                          <!-- Status icon / Unpin toggle on hover -->
                          <button
                            type="button"
                            title="Unpin task"
                            class="flex size-4 shrink-0 items-center justify-center"
                            onclick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              pinnedTasksStore.togglePin(task.id);
                            }}
                          >
                            <span class="group-hover/taskrow:hidden">
                              {#if task.status === "running"}
                                <LoaderCircle
                                  class="size-3.5 animate-spin text-emerald-500"
                                />
                              {:else if task.status === "error"}
                                <AlertCircle class="size-3.5 text-red-500" />
                              {:else if task.status === "completed"}
                                <CheckCircle2 class="size-3.5 text-blue-500" />
                              {:else}
                                <Cpu
                                  class="size-3.5 text-muted-foreground/50"
                                />
                              {/if}
                            </span>
                            <span
                              class="hidden group-hover/taskrow:block text-sidebar-foreground/70 hover:text-sidebar-foreground"
                            >
                              <Pin class="size-3.5 rotate-45" />
                            </span>
                          </button>
                          <span class="flex-1 truncate min-w-0 leading-none">
                            {task.goal || task.id}
                          </span>
                        </Sidebar.MenuButton>
                      </HoverCard.Trigger>
                      <HoverCard.Content
                        side="right"
                        align="start"
                        sideOffset={12}
                        class="w-64 rounded-lg border border-border/60 bg-popover p-0 shadow-lg"
                      >
                        <!-- Header -->
                        <div class="px-3.5 pt-3 pb-2.5">
                          <p
                            class="text-sm font-medium leading-snug text-foreground line-clamp-3"
                          >
                            {task.goal || task.id}
                          </p>
                          <div class="mt-1.5 flex items-center gap-1.5">
                            <span
                              class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide {task.status ===
                              'running'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : task.status === 'error'
                                  ? 'bg-red-500/10 text-red-600'
                                  : task.status === 'completed'
                                    ? 'bg-blue-500/10 text-blue-600'
                                    : 'bg-muted text-muted-foreground'}"
                            >
                              {#if task.status === "running"}
                                <LoaderCircle class="size-2.5 animate-spin" />
                              {/if}
                              {task.status}
                            </span>
                          </div>
                        </div>
                        <!-- Details -->
                        <div
                          class="border-t border-border/40 px-3.5 py-2 space-y-1.5 text-xs text-muted-foreground"
                        >
                          <div class="flex items-center justify-between">
                            <span>Viber</span>
                            <span
                              class="inline-flex items-center gap-1 text-foreground/80"
                            >
                              {#if task.viberConnected}
                                <Wifi class="size-3 text-emerald-500" />
                              {:else if task.viberName}
                                <WifiOff
                                  class="size-3 text-muted-foreground/60"
                                />
                              {/if}
                              {task.viberName ?? "—"}
                            </span>
                          </div>
                          {#if task.environmentName}
                            <div class="flex items-center justify-between">
                              <span>Environment</span>
                              <span class="text-foreground/80"
                                >{task.environmentName}</span
                              >
                            </div>
                          {/if}
                        </div>
                        <!-- Actions -->
                        <div
                          class="border-t border-border/40 px-2 py-1.5 flex items-center gap-1"
                        >
                          <a
                            href={`/tasks/${task.id}/jobs`}
                            class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          >
                            <CalendarClock class="size-3.5" />
                            Jobs
                          </a>
                        </div>
                      </HoverCard.Content>
                    </HoverCard.Root>
                    <!-- Time badge (visible by default, hidden on hover) -->
                    {#if task.createdAt}
                      <span
                        class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-sidebar-foreground/40 group-hover/taskrow:opacity-0 transition-opacity pointer-events-none"
                      >
                        {timeAgo(task.createdAt)}
                      </span>
                    {/if}
                    <!-- Archive button (shown on hover, replaces time) -->
                    <button
                      type="button"
                      title="Archive task"
                      class="absolute right-1 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all opacity-0 group-hover/taskrow:opacity-100"
                      onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        archiveTask(task.id);
                      }}
                    >
                      <Archive class="size-3.5" />
                    </button>
                  </div>
                </Sidebar.MenuItem>
              {/each}
              {#if unpinnedTaskGroups.length > 0}
                <div class="my-1 mx-2.5 border-t border-border/30"></div>
              {/if}
            {/if}

            <!-- Unpinned tasks in environment groups -->
            {#each unpinnedTaskGroups as group (group.environmentId ?? "__unassigned__")}
              <Collapsible open={true} class="group/collapsible">
                <Sidebar.MenuItem>
                  <CollapsibleTrigger class="w-full">
                    <Sidebar.MenuButton class="text-sidebar-foreground/70">
                      <FolderGit2 class="size-4 shrink-0" />
                      <span class="truncate text-xs font-medium">
                        {group.label}
                      </span>
                      <ChevronRight
                        class="ml-auto size-3.5 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90"
                      />
                    </Sidebar.MenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Sidebar.MenuSub
                      class="mx-0 translate-x-0 border-0 px-0 py-1"
                    >
                      {#each group.tasks as task (task.id)}
                        <Sidebar.MenuSubItem class="overflow-hidden">
                          <div
                            class="group/taskrow relative flex w-full items-center"
                          >
                            <HoverCard.Root openDelay={400} closeDelay={100}>
                              <HoverCard.Trigger class="min-w-0 w-full">
                                <Sidebar.MenuSubButton
                                  href={`/tasks/${task.id}`}
                                  isActive={pathname.startsWith(
                                    `/tasks/${task.id}`,
                                  )}
                                  class="min-h-8 translate-x-0 gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground pr-8 overflow-hidden"
                                >
                                  <!-- Status icon / Pin toggle on hover -->
                                  <button
                                    type="button"
                                    title="Pin task"
                                    class="flex size-4 shrink-0 items-center justify-center"
                                    onclick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      pinnedTasksStore.togglePin(task.id);
                                    }}
                                  >
                                    <span class="group-hover/taskrow:hidden">
                                      {#if task.status === "running"}
                                        <LoaderCircle
                                          class="size-3.5 animate-spin text-emerald-500"
                                        />
                                      {:else if task.status === "error"}
                                        <AlertCircle
                                          class="size-3.5 text-red-500"
                                        />
                                      {:else if task.status === "completed"}
                                        <CheckCircle2
                                          class="size-3.5 text-blue-500"
                                        />
                                      {:else}
                                        <Cpu
                                          class="size-3.5 text-muted-foreground/50"
                                        />
                                      {/if}
                                    </span>
                                    <span
                                      class="hidden group-hover/taskrow:block text-sidebar-foreground/40 hover:text-sidebar-foreground"
                                    >
                                      <Pin class="size-3.5" />
                                    </span>
                                  </button>
                                  <span
                                    class="flex-1 truncate min-w-0 leading-none"
                                  >
                                    {task.goal || task.id}
                                  </span>
                                </Sidebar.MenuSubButton>
                              </HoverCard.Trigger>
                              <HoverCard.Content
                                side="right"
                                align="start"
                                sideOffset={12}
                                class="w-64 rounded-lg border border-border/60 bg-popover p-0 shadow-lg"
                              >
                                <!-- Header -->
                                <div class="px-3.5 pt-3 pb-2.5">
                                  <p
                                    class="text-sm font-medium leading-snug text-foreground line-clamp-3"
                                  >
                                    {task.goal || task.id}
                                  </p>
                                  <div class="mt-1.5 flex items-center gap-1.5">
                                    <span
                                      class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide {task.status ===
                                      'running'
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : task.status === 'error'
                                          ? 'bg-red-500/10 text-red-600'
                                          : task.status === 'completed'
                                            ? 'bg-blue-500/10 text-blue-600'
                                            : 'bg-muted text-muted-foreground'}"
                                    >
                                      {#if task.status === "running"}
                                        <LoaderCircle
                                          class="size-2.5 animate-spin"
                                        />
                                      {/if}
                                      {task.status}
                                    </span>
                                  </div>
                                </div>
                                <!-- Details -->
                                <div
                                  class="border-t border-border/40 px-3.5 py-2 space-y-1.5 text-xs text-muted-foreground"
                                >
                                  <div
                                    class="flex items-center justify-between"
                                  >
                                    <span>Viber</span>
                                    <span
                                      class="inline-flex items-center gap-1 text-foreground/80"
                                    >
                                      {#if task.viberConnected}
                                        <Wifi class="size-3 text-emerald-500" />
                                      {:else if task.viberName}
                                        <WifiOff
                                          class="size-3 text-muted-foreground/60"
                                        />
                                      {/if}
                                      {task.viberName ?? "—"}
                                    </span>
                                  </div>
                                  {#if task.environmentName}
                                    <div
                                      class="flex items-center justify-between"
                                    >
                                      <span>Environment</span>
                                      <span class="text-foreground/80"
                                        >{task.environmentName}</span
                                      >
                                    </div>
                                  {/if}
                                </div>
                                <!-- Actions -->
                                <div
                                  class="border-t border-border/40 px-2 py-1.5 flex items-center gap-1"
                                >
                                  <a
                                    href={`/tasks/${task.id}/jobs`}
                                    class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                  >
                                    <CalendarClock class="size-3.5" />
                                    Jobs
                                  </a>
                                </div>
                              </HoverCard.Content>
                            </HoverCard.Root>
                            <!-- Time badge (visible by default, hidden on hover) -->
                            {#if task.createdAt}
                              <span
                                class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-sidebar-foreground/40 group-hover/taskrow:opacity-0 transition-opacity pointer-events-none"
                              >
                                {timeAgo(task.createdAt)}
                              </span>
                            {/if}
                            <!-- Archive button (shown on hover, replaces time) -->
                            <button
                              type="button"
                              title="Archive task"
                              class="absolute right-1 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all opacity-0 group-hover/taskrow:opacity-100"
                              onclick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                archiveTask(task.id);
                              }}
                            >
                              <Archive class="size-3.5" />
                            </button>
                          </div>
                        </Sidebar.MenuSubItem>
                      {/each}
                    </Sidebar.MenuSub>
                  </CollapsibleContent>
                </Sidebar.MenuItem>
              </Collapsible>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    {/if}
  {/snippet}
  {@render children()}
</AppSidebar>
