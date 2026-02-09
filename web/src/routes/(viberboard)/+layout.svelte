<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import {
    Archive,
    CalendarClock,
    ChevronRight,
    Circle,
    Cpu,
    FolderGit2,
    LoaderCircle,
    Plus,
    Server,
    Settings2,
    Wifi,
    WifiOff,
  } from "@lucide/svelte";
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import AppSidebar from "$lib/components/layout/app-sidebar.svelte";
  import { getVibersStore } from "$lib/stores/vibers";

  interface SidebarViber {
    id: string;
    goal: string;
    nodeId: string | null;
    nodeName: string | null;
    environmentId: string | null;
    environmentName: string | null;
    status: string;
    /** Connection status of the node hosting this viber; null if no node */
    nodeConnected: boolean | null;
  }

  type ViberStatus = "running" | "completed" | "error" | "pending" | "stopped";

  interface SidebarEnvironment {
    id: string;
    name: string;
  }

  interface ViberGroup {
    label: string;
    environmentId: string | null;
    vibers: SidebarViber[];
  }

  let { children } = $props();

  const vibersStore = getVibersStore();
  const vibersState = $derived($vibersStore);
  const vibers = $derived(vibersState.vibers as SidebarViber[]);
  let environments = $state<SidebarEnvironment[]>([]);

  const viberGroups = $derived.by(() => {
    const groups = new Map<string, ViberGroup>();

    for (const viber of vibers) {
      const key = viber.environmentId ?? "__unassigned__";
      if (!groups.has(key)) {
        groups.set(key, {
          label: viber.environmentName ?? "Unassigned",
          environmentId: viber.environmentId,
          vibers: [],
        });
      }
      groups.get(key)!.vibers.push(viber);
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (!a.environmentId) return 1;
      if (!b.environmentId) return -1;
      return a.label.localeCompare(b.label);
    });
  });

  const pathname = $derived($page.url.pathname);
  const isVibersRoute = $derived(
    pathname === "/vibers" || pathname.startsWith("/vibers/"),
  );
  const isNewViberRoute = $derived(pathname === "/vibers/new");
  const isNodesRoute = $derived(
    pathname === "/nodes" || pathname.startsWith("/nodes/"),
  );
  const isEnvironmentsRoute = $derived(
    pathname === "/environments" || pathname.startsWith("/environments/"),
  );
  const isJobsRoute = $derived(
    pathname === "/jobs" || pathname.startsWith("/jobs/"),
  );

  const archivingViberIds = $state<Set<string>>(new Set());

  function getStatusTone(status: string): string {
    switch (status as ViberStatus) {
      case "running":
        return "text-emerald-500";
      case "completed":
        return "text-blue-500";
      case "error":
        return "text-red-500";
      case "stopped":
        return "text-muted-foreground";
      default:
        return "text-amber-500";
    }
  }

  async function archiveViber(viberId: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (archivingViberIds.has(viberId)) {
      return;
    }

    const next = new Set(archivingViberIds);
    next.add(viberId);
    archivingViberIds.clear();
    next.forEach((id) => archivingViberIds.add(id));

    try {
      const response = await fetch(`/api/vibers/${viberId}/archive`, {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      await vibersStore.invalidate();
    } catch (error) {
      console.error("Failed to archive viber:", error);
    } finally {
      const remaining = new Set(archivingViberIds);
      remaining.delete(viberId);
      archivingViberIds.clear();
      remaining.forEach((id) => archivingViberIds.add(id));
    }
  }

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
    void vibersStore.getVibers();
    void fetchEnvironments();

    const interval = setInterval(() => {
      void vibersStore.getVibers();
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
            <Sidebar.MenuButton
              isActive={isNewViberRoute}
              tooltipContent="New Viber"
            >
              <a
                href="/vibers/new"
                class="w-full inline-flex items-center gap-2"
              >
                <Plus class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >New Viber</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isVibersRoute && !isNewViberRoute}
              tooltipContent="Vibers"
            >
              <a href="/vibers" class="w-full inline-flex items-center gap-2">
                <Cpu class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Vibers</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={isNodesRoute} tooltipContent="Nodes">
              <a href="/nodes" class="w-full inline-flex items-center gap-2">
                <Server class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Nodes</span
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
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if viberGroups.length > 0}
      <Sidebar.Separator />
      <Sidebar.Group>
        <Sidebar.GroupLabel
          class="text-[10px] uppercase tracking-wider text-sidebar-foreground/55 px-2"
        >
          Vibers
        </Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each viberGroups as group (group.environmentId ?? "__unassigned__")}
              <Collapsible open={true} class="group/collapsible">
                <Sidebar.MenuItem>
                  <CollapsibleTrigger class="w-full">
                    <Sidebar.MenuButton class="text-sidebar-foreground/70">
                      <FolderGit2 class="size-4 shrink-0" />
                      <span
                        class="truncate text-xs font-medium group-data-[collapsible=icon]:hidden"
                      >
                        {group.label}
                      </span>
                      <ChevronRight
                        class="ml-auto size-3.5 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
                      />
                    </Sidebar.MenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Sidebar.MenuSub
                      class="mx-0 translate-x-0 border-0 px-0 py-1"
                    >
                      {#each group.vibers as viber (viber.id)}
                        <Sidebar.MenuSubItem>
                          <HoverCard.Root openDelay={400} closeDelay={100}>
                            <HoverCard.Trigger asChild>
                              <Sidebar.MenuSubButton
                                href={`/vibers/${viber.id}`}
                                isActive={pathname.startsWith(
                                  `/vibers/${viber.id}`,
                                )}
                                class="min-h-8 -translate-x-0 gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
                              >
                                {#if viber.status === "running"}
                                  <span
                                    class="flex size-4 shrink-0 items-center justify-center"
                                  >
                                    <LoaderCircle
                                      class="size-3.5 animate-spin text-emerald-500"
                                    />
                                  </span>
                                {:else if viber.status === "error"}
                                  <span
                                    class="flex size-4 shrink-0 items-center justify-center"
                                  >
                                    <Circle
                                      class="size-2.5 fill-current text-red-500"
                                    />
                                  </span>
                                {/if}
                                <span
                                  class="truncate leading-none group-data-[collapsible=icon]:hidden"
                                >
                                  {viber.goal.length > 42
                                    ? viber.goal.slice(0, 42) + "…"
                                    : viber.goal || viber.id}
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
                                  class="text-sm font-medium leading-snug text-foreground"
                                >
                                  {viber.goal || viber.id}
                                </p>
                                <div class="mt-1.5 flex items-center gap-1.5">
                                  <span
                                    class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide {viber.status ===
                                    'running'
                                      ? 'bg-emerald-500/10 text-emerald-600'
                                      : viber.status === 'error'
                                        ? 'bg-red-500/10 text-red-600'
                                        : viber.status === 'completed'
                                          ? 'bg-blue-500/10 text-blue-600'
                                          : 'bg-muted text-muted-foreground'}"
                                  >
                                    {#if viber.status === "running"}
                                      <LoaderCircle
                                        class="size-2.5 animate-spin"
                                      />
                                    {/if}
                                    {viber.status}
                                  </span>
                                </div>
                              </div>
                              <!-- Details -->
                              <div
                                class="border-t border-border/40 px-3.5 py-2 space-y-1.5 text-xs text-muted-foreground"
                              >
                                <div class="flex items-center justify-between">
                                  <span>Node</span>
                                  <span
                                    class="inline-flex items-center gap-1 text-foreground/80"
                                  >
                                    {#if viber.nodeConnected}
                                      <Wifi class="size-3 text-emerald-500" />
                                    {:else if viber.nodeName}
                                      <WifiOff
                                        class="size-3 text-muted-foreground/60"
                                      />
                                    {/if}
                                    {viber.nodeName ?? "—"}
                                  </span>
                                </div>
                                {#if viber.environmentName}
                                  <div
                                    class="flex items-center justify-between"
                                  >
                                    <span>Environment</span>
                                    <span class="text-foreground/80"
                                      >{viber.environmentName}</span
                                    >
                                  </div>
                                {/if}
                              </div>
                              <!-- Actions -->
                              <div
                                class="border-t border-border/40 px-2 py-1.5 flex items-center gap-1"
                              >
                                <a
                                  href={`/vibers/${viber.id}/jobs`}
                                  class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                >
                                  <CalendarClock class="size-3.5" />
                                  Jobs
                                </a>
                                <a
                                  href={`/vibers/${viber.id}?config=1`}
                                  class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                >
                                  <Settings2 class="size-3.5" />
                                  Config
                                </a>
                                <button
                                  type="button"
                                  class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  onclick={(event: MouseEvent) =>
                                    archiveViber(viber.id, event)}
                                >
                                  {#if archivingViberIds.has(viber.id)}
                                    <LoaderCircle
                                      class="size-3.5 animate-spin"
                                    />
                                  {:else}
                                    <Archive class="size-3.5" />
                                  {/if}
                                  Archive
                                </button>
                              </div>
                            </HoverCard.Content>
                          </HoverCard.Root>
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
