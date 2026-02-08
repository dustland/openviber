<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import {
    ChevronDown,
    ChevronRight,
    Circle,
    Cpu,
    FolderGit2,
    Plus,
    Server,
  } from "@lucide/svelte";
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";

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

  const user = $derived(($page.data?.user as SessionUser | undefined) || null);

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
                      <Sidebar.MenuSub>
                        {#each group.vibers as viber (viber.id)}
                          <Sidebar.MenuSubItem>
                            <Sidebar.MenuSubButton
                              isActive={pathname.startsWith(
                                `/vibers/${viber.id}`,
                              )}
                            >
                              <a
                                href="/vibers/{viber.id}"
                                class="w-full inline-flex items-center gap-2"
                              >
                                <Circle
                                  class="size-2 shrink-0 {viber.status ===
                                  'running'
                                    ? 'fill-blue-500 text-blue-500'
                                    : viber.status === 'completed'
                                      ? 'fill-green-500 text-green-500'
                                      : viber.status === 'error'
                                        ? 'fill-red-500 text-red-500'
                                        : 'fill-amber-500 text-amber-500'}"
                                />
                                <span
                                  class="truncate text-xs group-data-[collapsible=icon]:hidden"
                                >
                                  {viber.goal.length > 40
                                    ? viber.goal.slice(0, 40) + "…"
                                    : viber.goal || viber.id}
                                </span>
                                {#if viber.nodeName}
                                  <span
                                    class="ml-auto shrink-0 text-[10px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden"
                                  >
                                    {viber.nodeName}
                                  </span>
                                {/if}
                              </a>
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
