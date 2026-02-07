<script lang="ts">
  import { goto } from "$app/navigation";
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
    Package,
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

  interface ViberNode {
    id: string;
    name: string;
    status: "pending" | "active" | "offline";
  }

  interface SidebarViber {
    id: string;
    name: string;
    isConnected: boolean;
    environmentId: string | null;
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

  let nodes = $state<ViberNode[]>([]);
  let vibers = $state<SidebarViber[]>([]);
  let environments = $state<SidebarEnvironment[]>([]);

  const viberGroups = $derived.by(() => {
    const envMap = new Map(environments.map((e) => [e.id, e.name]));
    const groups = new Map<string, ViberGroup>();

    for (const viber of vibers) {
      const key = viber.environmentId ?? "__unassigned__";
      if (!groups.has(key)) {
        groups.set(key, {
          label: viber.environmentId
            ? (envMap.get(viber.environmentId) ?? "Unknown")
            : "Unassigned",
          environmentId: viber.environmentId,
          vibers: [],
        });
      }
      groups.get(key)!.vibers.push(viber);
    }

    // Sort: named environments first (alphabetical), then unassigned last
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
  const isEnvironmentsRoute = $derived(
    pathname === "/environments" || pathname.startsWith("/environments/"),
  );
  const isNodesRoute = $derived(
    pathname === "/nodes" || pathname.startsWith("/nodes/"),
  );

  const activeNodeFilterId = $derived($page.url.searchParams.get("node") || "");

  const user = $derived(($page.data?.user as SessionUser | undefined) || null);

  function buildCurrentUrl(next: URLSearchParams) {
    const query = next.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }

  function getNewViberHref() {
    const params = new URLSearchParams();
    if (activeNodeFilterId) {
      params.set("node", activeNodeFilterId);
    }
    const query = params.toString();
    return `/vibers/new${query ? `?${query}` : ""}`;
  }

  async function selectNodeFilter(nodeId: string) {
    const params = new URLSearchParams($page.url.searchParams);

    if (!nodeId) {
      params.delete("node");
    } else {
      params.set("node", nodeId);
    }

    await goto(buildCurrentUrl(params), {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  async function fetchNodes() {
    try {
      const response = await fetch("/api/nodes");
      if (!response.ok) {
        nodes = [];
        return;
      }

      const payload = await response.json();
      nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    } catch (error) {
      console.error("Failed to fetch nodes:", error);
      nodes = [];
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
            name: String(v.name || v.id),
            isConnected: Boolean(v.isConnected),
            environmentId:
              typeof v.environmentId === "string" ? v.environmentId : null,
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
    await Promise.all([fetchNodes(), fetchVibers(), fetchEnvironments()]);
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
                  href={getNewViberHref()}
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
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>

      {#if nodes.length > 0}
        <Sidebar.Group>
          <Sidebar.GroupContent>
            <div class="px-2 space-y-1.5 group-data-[collapsible=icon]:hidden">
              <label
                for="node-filter"
                class="text-[10px] uppercase tracking-wider text-sidebar-foreground/55"
              >
                Node Filter
              </label>
              <select
                id="node-filter"
                class="h-8 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-xs text-sidebar-foreground"
                value={activeNodeFilterId}
                onchange={(event) => {
                  const target = event.currentTarget as HTMLSelectElement;
                  void selectNodeFilter(target.value);
                }}
              >
                <option value="">All nodes</option>
                {#each nodes as node (node.id)}
                  <option value={node.id}>{node.name}</option>
                {/each}
              </select>
            </div>
          </Sidebar.GroupContent>
        </Sidebar.Group>
      {/if}

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
                        {#if group.environmentId}
                          <FolderGit2 class="size-4 shrink-0" />
                        {:else}
                          <Package class="size-4 shrink-0" />
                        {/if}
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
                                  class="size-2 shrink-0 {viber.isConnected
                                    ? 'fill-green-500 text-green-500'
                                    : 'fill-gray-400 text-gray-400'}"
                                />
                                <span
                                  class="truncate text-xs group-data-[collapsible=icon]:hidden"
                                >
                                  {viber.name}
                                </span>
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
