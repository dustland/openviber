<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import {
    Archive,
    BookOpen,
    CalendarClock,
    Check,
    ChevronDown,
    ChevronRight,
    Circle,
    Cpu,
    FolderGit2,
    LoaderCircle,
    Laptop,
    Moon,
    Plus,
    Puzzle,
    Server,
    Settings2,
    Sun,
  } from "@lucide/svelte";
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import { themeStore, type Theme } from "$lib/stores/theme";

  function setTheme(nextTheme: Theme) {
    themeStore.set(nextTheme);
  }

  interface SessionUser {
    name: string;
    email: string;
    avatarUrl?: string | null;
  }

  interface SidebarViber {
    id: string;
    goal: string;
    nodeId: string | null;
    nodeName: string | null;
    environmentId: string | null;
    environmentName: string | null;
    status: string;
    isConnected: boolean;
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

  let vibers = $state<SidebarViber[]>([]);
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
  const isSkillsRoute = $derived(
    pathname === "/skills" || pathname.startsWith("/skills/"),
  );
  const isJobsRoute = $derived(
    pathname === "/jobs" || pathname.startsWith("/jobs/"),
  );

  const user = $derived(($page.data?.user as SessionUser | undefined) || null);

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

      await fetchVibers();
    } catch (error) {
      console.error("Failed to archive viber:", error);
    } finally {
      const remaining = new Set(archivingViberIds);
      remaining.delete(viberId);
      archivingViberIds.clear();
      remaining.forEach((id) => archivingViberIds.add(id));
    }
  }

  async function fetchVibers() {
    try {
      const response = await fetch("/api/vibers");
      if (!response.ok) {
        vibers = [];
        return;
      }
      const data = await response.json();
      vibers = Array.isArray(data)
        ? data.map((v: Record<string, unknown>) => ({
            id: String(v.id),
            goal: String(v.goal || ""),
            nodeId: typeof v.nodeId === "string" ? v.nodeId : null,
            nodeName: typeof v.nodeName === "string" ? v.nodeName : null,
            environmentId:
              typeof v.environmentId === "string" ? v.environmentId : null,
            environmentName:
              typeof v.environmentName === "string" ? v.environmentName : null,
            status: String(v.status || "unknown"),
            isConnected: Boolean(v.isConnected),
          }))
        : [];
    } catch (error) {
      console.error("Failed to fetch vibers:", error);
      vibers = [];
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

  async function fetchAll() {
    await Promise.all([fetchVibers(), fetchEnvironments()]);
  }

  onMount(() => {
    void fetchAll();

    const interval = setInterval(() => {
      void fetchAll();
    }, 5000);

    return () => clearInterval(interval);
  });
</script>

<Sidebar.Provider>
  <Sidebar.Root collapsible="icon">
    <Sidebar.Header class="p-2 pb-1">
      <Sidebar.Menu>
        <Sidebar.MenuItem class="flex items-center gap-2">
          <a
            href="/"
            class="w-full inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-accent transition-colors"
            title="OpenViber"
          >
            <img src="/favicon.png" alt="OpenViber" class="size-5" />
            <span
              class="truncate font-medium group-data-[collapsible=icon]:hidden"
            >
              OpenViber
            </span>
          </a>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Header>

    <Sidebar.Content>
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
              <Sidebar.MenuButton
                isActive={isNodesRoute}
                tooltipContent="Nodes"
              >
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
              <Sidebar.MenuButton
                isActive={isJobsRoute}
                tooltipContent="Jobs"
              >
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
                      <Sidebar.MenuSub class="mx-0 translate-x-0 border-0 px-0 py-1">
                        {#each group.vibers as viber (viber.id)}
                          <Sidebar.MenuSubItem>
                            <Sidebar.MenuSubButton
                              href={`/vibers/${viber.id}`}
                              isActive={pathname.startsWith(
                                `/vibers/${viber.id}`,
                              )}
                              class="min-h-10 -translate-x-0 gap-2.5 rounded-xl px-3 pr-10 py-2 text-[13px] font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent/75 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-[inset_0_0_0_1px_hsl(var(--sidebar-border)/0.65)]"
                            >
                              {#snippet child({ props })}
                                <div class="group/viber relative w-full space-y-1">
                                  <a {...props} class="flex items-center gap-2.5">
                                    <span
                                      class="flex size-4 shrink-0 items-center justify-center"
                                    >
                                      {#if viber.status === "running"}
                                        <LoaderCircle
                                          class="size-3.5 animate-spin text-emerald-500"
                                        />
                                      {:else}
                                        <Circle
                                          class="size-2.5 fill-current {getStatusTone(
                                            viber.status,
                                          )}"
                                        />
                                      {/if}
                                    </span>
                                    <span
                                      class="truncate leading-none group-data-[collapsible=icon]:hidden"
                                    >
                                      {viber.goal.length > 42
                                        ? viber.goal.slice(0, 42) + "…"
                                        : viber.goal || viber.id}
                                    </span>
                                  </a>
                                  <div
                                    class="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[11px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden"
                                  >
                                    <span class="truncate" title={viber.nodeName ?? undefined}>
                                      {viber.nodeName ?? "No node"}
                                    </span>
                                    <span class="shrink-0 text-sidebar-foreground/40">·</span>
                                    <a
                                      href={`/vibers/${viber.id}/jobs`}
                                      class="hover:text-sidebar-foreground/80 focus:outline-none focus:underline"
                                      onclick={(e: MouseEvent) => e.stopPropagation()}
                                    >Jobs</a>
                                    <span class="shrink-0 text-sidebar-foreground/40">·</span>
                                    <a
                                      href={`/vibers/${viber.id}?config=1`}
                                      class="inline-flex items-center gap-0.5 hover:text-sidebar-foreground/80 focus:outline-none focus:underline"
                                      onclick={(e: MouseEvent) => e.stopPropagation()}
                                    >
                                      <Settings2 class="size-3" />
                                      Configure
                                    </a>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label="Archive viber"
                                    class="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-sidebar-foreground/60 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden group-hover/viber:opacity-100 group-focus-within/viber:opacity-100"
                                    onclick={(event: MouseEvent) =>
                                      archiveViber(viber.id, event)}
                                  >
                                    {#if archivingViberIds.has(viber.id)}
                                      <LoaderCircle class="size-3.5 animate-spin" />
                                    {:else}
                                      <Archive class="size-3.5" />
                                    {/if}
                                  </button>
                                </div>
                              {/snippet}
                            </Sidebar.MenuSubButton>
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
    </Sidebar.Content>

    <Sidebar.Footer>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          {#if user}
            <DropdownMenu>
              <DropdownMenuTrigger
                class="w-full h-9 rounded-md px-2 text-sm text-sidebar-foreground inline-flex items-center gap-2.5 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
              >
                {#if user.avatarUrl}
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    class="size-6 rounded-full object-cover shrink-0"
                  />
                {:else}
                  <div
                    class="size-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0"
                  >
                    {user.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                {/if}
                <span
                  class="truncate flex-1 text-left group-data-[collapsible=icon]:hidden"
                >
                  {user.name}
                </span>
                <ChevronDown
                  class="size-3.5 opacity-50 group-data-[collapsible=icon]:hidden"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
                class="min-w-48 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <div class="px-2.5 py-2 border-b border-border mb-1">
                  <p class="text-sm font-medium">{user.name}</p>
                  <p class="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => goto("/docs")}
                >
                  <BookOpen class="size-4" />
                  Docs
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div class="px-2.5 py-1.5">
                  <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Theme</p>
                </div>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => setTheme("system")}
                >
                  <Laptop class="size-4" />
                  System
                  {#if $themeStore === "system"}<Check class="size-4 ml-auto" />{/if}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => setTheme("light")}
                >
                  <Sun class="size-4" />
                  Light
                  {#if $themeStore === "light"}<Check class="size-4 ml-auto" />{/if}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => setTheme("dark")}
                >
                  <Moon class="size-4" />
                  Dark
                  {#if $themeStore === "dark"}<Check class="size-4 ml-auto" />{/if}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer text-destructive"
                  onSelect={() => {
                    const form = document.createElement("form");
                    form.method = "POST";
                    form.action = "/auth/logout";
                    document.body.appendChild(form);
                    form.submit();
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          {:else}
            <a
              href="/login"
              class="w-full text-left text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground px-2 py-1.5 rounded-md hover:bg-sidebar-accent"
            >
              Sign in
            </a>
          {/if}
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Footer>

    <Sidebar.Rail />
  </Sidebar.Root>

  <Sidebar.Inset class="flex flex-col h-full min-h-0 bg-background">
    {@render children()}
  </Sidebar.Inset>
</Sidebar.Provider>
