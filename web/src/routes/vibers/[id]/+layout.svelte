<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy } from "svelte";
  import { headerStore } from "$lib/stores/header";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import * as Resizable from "$lib/components/ui/resizable";
  import {
    MessageSquare,
    Terminal,
    Server,
    ChevronDown,
    ChevronRight,
    Plus,
    Circle,
    BookOpen,
    Moon,
    Sun,
    Laptop,
    Check,
    Home,
  } from "@lucide/svelte";

  type Theme = "light" | "dark" | "system";

  interface ViberSkill {
    id: string;
    name: string;
    description: string;
  }

  interface Viber {
    id: string;
    name: string;
    platform: string | null;
    version: string | null;
    capabilities: string[] | null;
    skills?: ViberSkill[] | null;
    isConnected: boolean;
  }

  interface ChatSession {
    id: string;
    name: string;
    updatedAt: Date;
  }

  interface TmuxPane {
    session: string;
    window: string;
    windowName: string;
    pane: string;
    command: string;
    target: string;
  }

  interface PortTarget {
    id: string;
    name: string;
    port: string;
  }

  let { children, data } = $props();
  let viber = $state<Viber | null>(null);
  let loading = $state(true);
  let theme = $state<Theme>("system");

  // Collapsible group states
  let chatsExpanded = $state(true);
  let terminalsExpanded = $state(true);
  let portsExpanded = $state(true);

  // Data
  let chatSessions = $state<ChatSession[]>([]);
  let terminalPanes = $state<TmuxPane[]>([]);
  let ports = $state<PortTarget[]>([]);

  // Active app panel
  let activeTerminal = $state<string | null>(null);
  let appPanelExpanded = $state(true);
  let mobileViewMode = $state<"chat" | "computer">("chat");

  // Terminal WebSocket
  let terminalWs = $state<WebSocket | null>(null);

  const viberId = $derived($page.params.id);

  function applyTheme(selectedTheme: Theme) {
    if (typeof window === "undefined") return;
    if (selectedTheme === "system") {
      localStorage.removeItem("theme");
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", isDark);
      return;
    }
    localStorage.setItem("theme", selectedTheme);
    document.documentElement.classList.toggle("dark", selectedTheme === "dark");
  }

  function setTheme(nextTheme: Theme) {
    theme = nextTheme;
    applyTheme(theme);
  }

  async function fetchViber() {
    try {
      const response = await fetch(`/api/vibers/${viberId}`);
      if (response.ok) {
        viber = await response.json();
        if (chatSessions.length === 0) {
          chatSessions = [
            { id: "default", name: "Chat", updatedAt: new Date() },
          ];
        }
      }
    } catch (error) {
      console.error("Failed to fetch viber:", error);
    } finally {
      loading = false;
    }
  }

  function connectTerminalWs() {
    if (typeof window === "undefined") return;
    const wsUrl = `ws://${window.location.hostname}:6008`;

    terminalWs = new WebSocket(wsUrl);

    terminalWs.onopen = () => {
      terminalWs?.send(JSON.stringify({ type: "terminal:list" }));
    };

    terminalWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "terminal:list") {
          terminalPanes = msg.panes || [];
          // Auto-select first terminal if none selected
          if (!activeTerminal && terminalPanes.length > 0) {
            activeTerminal = terminalPanes[0].target;
          }
        }
      } catch {}
    };

    terminalWs.onclose = () => {
      terminalWs = null;
    };
  }

  function loadPorts() {
    if (typeof localStorage === "undefined") return;
    const stored = localStorage.getItem("viber-board-port-forward-targets");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          ports = parsed.map((p: any) => ({
            id: p.id,
            name: p.name,
            port: p.port,
          }));
        }
      } catch {}
    }
    if (ports.length === 0) {
      ports = [{ id: "dev-server", name: "Dev Server", port: "6006" }];
    }
  }

  function selectTerminal(target: string) {
    activeTerminal = target;
    appPanelExpanded = true;
  }

  // Sync viber context to header
  $effect(() => {
    if (viber?.id) {
      headerStore.setViberContext({
        viberId: viber.id,
        viberName: viber.name,
        isConnected: viber.isConnected,
        platform: viber.platform,
        skills: viber.skills ?? [],
        activeTab: "chat",
      });
    }
  });

  onMount(() => {
    // Load theme
    const stored = localStorage.getItem("theme");
    theme = stored === "dark" || stored === "light" ? stored : "system";

    fetchViber();
    connectTerminalWs();
    loadPorts();

    const interval = setInterval(() => {
      fetchViber();
      terminalWs?.send(JSON.stringify({ type: "terminal:list" }));
    }, 5000);

    return () => {
      clearInterval(interval);
      headerStore.setViberContext(null);
    };
  });

  onDestroy(() => {
    terminalWs?.close();
  });

  // Group terminals by session
  const terminalsBySession = $derived(() => {
    const map = new Map<string, TmuxPane[]>();
    for (const pane of terminalPanes) {
      const list = map.get(pane.session) || [];
      list.push(pane);
      map.set(pane.session, list);
    }
    return map;
  });

  // Export for child components
  export function getTerminalWs() {
    return terminalWs;
  }

  export function getActiveTerminal() {
    return activeTerminal;
  }
</script>

<Sidebar.Provider>
  <Sidebar.Root collapsible="icon" class="border-r border-sidebar-border">
    <Sidebar.Header class="p-2 pb-1">
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            size="sm"
            tooltipContent="Back to Vibers"
            class="group-data-[collapsible=icon]:p-0!"
          >
            {#snippet child({ props })}
              <a href="/vibers" {...props}>
                <Home class="size-5" />
                <span class="truncate font-semibold text-sm">Vibers</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
        <Sidebar.MenuItem>
          <div class="flex items-center gap-2 px-2 py-1">
            <img src="/favicon.png" alt="OpenViber" class="size-5" />
            <span class="truncate text-sm text-muted-foreground"
              >{viber?.name || "Viber"}</span
            >
            {#if viber?.isConnected}
              <span class="size-1.5 rounded-full bg-green-500 shrink-0"></span>
            {:else}
              <span class="size-1.5 rounded-full bg-muted-foreground shrink-0"
              ></span>
            {/if}
          </div>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Header>

    <Sidebar.Content>
      <!-- Chats Group -->
      <Sidebar.Group>
        <Sidebar.GroupLabel class="flex items-center justify-between">
          <button
            onclick={() => (chatsExpanded = !chatsExpanded)}
            class="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {#if chatsExpanded}
              <ChevronDown class="size-3" />
            {:else}
              <ChevronRight class="size-3" />
            {/if}
            <span>Chats</span>
          </button>
          <button
            onclick={() => {}}
            class="p-0.5 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
            title="New chat"
          >
            <Plus class="size-3" />
          </button>
        </Sidebar.GroupLabel>
        {#if chatsExpanded}
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              {#each chatSessions as chat (chat.id)}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton
                    isActive={true}
                    tooltipContent={chat.name}
                  >
                    <MessageSquare class="size-4" />
                    <span>{chat.name}</span>
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        {/if}
      </Sidebar.Group>

      <!-- Terminals Group -->
      <Sidebar.Group>
        <Sidebar.GroupLabel class="flex items-center justify-between">
          <button
            onclick={() => (terminalsExpanded = !terminalsExpanded)}
            class="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {#if terminalsExpanded}
              <ChevronDown class="size-3" />
            {:else}
              <ChevronRight class="size-3" />
            {/if}
            <span>Terminals</span>
            {#if terminalPanes.length > 0}
              <span
                class="text-[9px] bg-sidebar-accent px-1.5 py-0.5 rounded-full font-normal normal-case ml-1"
              >
                {terminalPanes.length}
              </span>
            {/if}
          </button>
        </Sidebar.GroupLabel>
        {#if terminalsExpanded}
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              {#if terminalPanes.length === 0}
                <div class="px-2 py-1 text-[10px] text-muted-foreground">
                  No terminals
                </div>
              {:else}
                {#each Array.from(terminalsBySession().entries()) as [sessionName, panes]}
                  <div class="mb-1">
                    <div
                      class="px-2 py-0.5 text-[9px] font-medium text-muted-foreground uppercase group-data-[collapsible=icon]:hidden"
                    >
                      {sessionName}
                    </div>
                    {#each panes as pane}
                      <Sidebar.MenuItem>
                        <Sidebar.MenuButton
                          isActive={activeTerminal === pane.target}
                          onclick={() => selectTerminal(pane.target)}
                          tooltipContent={`${pane.windowName}:${pane.pane}`}
                        >
                          <Terminal class="size-4" />
                          <span class="font-mono text-[10px]"
                            >{pane.windowName}:{pane.pane}</span
                          >
                        </Sidebar.MenuButton>
                      </Sidebar.MenuItem>
                    {/each}
                  </div>
                {/each}
              {/if}
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        {/if}
      </Sidebar.Group>

      <!-- Ports Group -->
      <Sidebar.Group>
        <Sidebar.GroupLabel class="flex items-center justify-between">
          <button
            onclick={() => (portsExpanded = !portsExpanded)}
            class="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {#if portsExpanded}
              <ChevronDown class="size-3" />
            {:else}
              <ChevronRight class="size-3" />
            {/if}
            <span>Ports</span>
          </button>
        </Sidebar.GroupLabel>
        {#if portsExpanded}
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              {#each ports as port (port.id)}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton
                    onclick={() =>
                      window.open(`http://localhost:${port.port}`, "_blank")}
                    tooltipContent={`${port.name} :${port.port}`}
                  >
                    <Server class="size-4" />
                    <span class="flex-1 truncate">{port.name}</span>
                    <span
                      class="text-[10px] opacity-60 group-data-[collapsible=icon]:hidden"
                      >:{port.port}</span
                    >
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        {/if}
      </Sidebar.Group>
    </Sidebar.Content>

    <Sidebar.Footer>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton tooltipContent="Documentation">
            {#snippet child({ props })}
              <a href="/docs" {...props}>
                <BookOpen class="size-4" />
                <span>Docs</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
        <Sidebar.MenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              class="w-full h-8 rounded-md border border-sidebar-border bg-sidebar px-2.5 text-sm text-sidebar-foreground inline-flex items-center gap-2 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
            >
              {#if theme === "light"}
                <Sun class="size-4 shrink-0" />
              {:else if theme === "dark"}
                <Moon class="size-4 shrink-0" />
              {:else}
                <Laptop class="size-4 shrink-0" />
              {/if}
              <span
                class="capitalize flex-1 text-left group-data-[collapsible=icon]:hidden"
                >{theme}</span
              >
              <ChevronDown
                class="size-3.5 opacity-50 group-data-[collapsible=icon]:hidden"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="end"
              sideOffset={8}
              class="min-w-36 rounded-md border border-border bg-popover p-1 shadow-md"
            >
              <DropdownMenuItem
                class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                onSelect={() => setTheme("system")}
              >
                <Laptop class="size-4" />
                System
                {#if theme === "system"}<Check class="size-4 ml-auto" />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                onSelect={() => setTheme("light")}
              >
                <Sun class="size-4" />
                Light
                {#if theme === "light"}<Check class="size-4 ml-auto" />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                onSelect={() => setTheme("dark")}
              >
                <Moon class="size-4" />
                Dark
                {#if theme === "dark"}<Check class="size-4 ml-auto" />{/if}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Sidebar.MenuItem>
        <Sidebar.MenuItem>
          {#if data?.user}
            <DropdownMenu>
              <DropdownMenuTrigger
                class="w-full h-9 rounded-md px-2 text-sm text-sidebar-foreground inline-flex items-center gap-2.5 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
              >
                {#if data.user.avatarUrl}
                  <img
                    src={data.user.avatarUrl}
                    alt={data.user.name}
                    class="size-6 rounded-full object-cover shrink-0"
                  />
                {:else}
                  <div
                    class="size-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0"
                  >
                    {data.user.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                {/if}
                <span
                  class="truncate flex-1 text-left group-data-[collapsible=icon]:hidden"
                  >{data.user.name}</span
                >
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
                  <p class="text-sm font-medium">{data.user.name}</p>
                  <p class="text-xs text-muted-foreground">{data.user.email}</p>
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

  <Sidebar.Inset class="flex flex-col h-full min-h-0">
    <!-- Mobile Toggle Bar (only visible on mobile) -->
    <div
      class="md:hidden flex items-center justify-center gap-1 p-2 bg-muted/30 border-b border-border"
    >
      <button
        onclick={() => (mobileViewMode = "chat")}
        class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors {mobileViewMode ===
        'chat'
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
      >
        <MessageSquare class="size-4 inline mr-1.5" />
        Chat
      </button>
      <button
        onclick={() => (mobileViewMode = "computer")}
        class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors {mobileViewMode ===
        'computer'
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
      >
        <Terminal class="size-4 inline mr-1.5" />
        Computer
      </button>
    </div>

    <!-- Main Content: Resizable Chat + App Panel -->
    <Resizable.PaneGroup direction="horizontal" class="flex-1 min-h-0">
      <!-- Chat Panel -->
      <Resizable.Pane
        defaultSize={appPanelExpanded && terminalPanes.length > 0 ? 50 : 100}
        minSize={20}
        class="md:block {mobileViewMode === 'chat' ? 'block' : 'hidden'}"
      >
        <div class="h-full flex flex-col">
          {@render children()}
        </div>
      </Resizable.Pane>

      <!-- Resize Handle + App Panel (Desktop) -->
      {#if appPanelExpanded && terminalPanes.length > 0}
        <Resizable.Handle withHandle class="bg-border hidden md:flex" />
        <Resizable.Pane
          defaultSize={50}
          minSize={20}
          maxSize={70}
          class="md:block {mobileViewMode === 'computer' ? 'block' : 'hidden'}"
        >
          <!-- My Computer Window Frame -->
          <div class="h-full p-3 bg-zinc-950/50">
            <div
              class="h-full flex flex-col rounded-xl bg-[#0d0d0d] border border-zinc-800/80 shadow-2xl overflow-hidden"
            >
              <!-- macOS-style Title Bar -->
              <div
                class="h-10 bg-zinc-900/90 flex items-center px-3 gap-2 border-b border-zinc-800/50 shrink-0"
              >
                <!-- Traffic lights (decorative) -->
                <div class="flex gap-1.5">
                  <button
                    class="size-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors"
                    onclick={() => (appPanelExpanded = false)}
                    title="Close"
                  ></button>
                  <div class="size-3 rounded-full bg-[#febc2e]"></div>
                  <div class="size-3 rounded-full bg-[#28c840]"></div>
                </div>
                <!-- Session name -->
                <span class="text-xs text-zinc-400 font-medium ml-2 truncate">
                  {activeTerminal
                    ? activeTerminal.replace(/:/g, " › ")
                    : "My Computer"}
                </span>
              </div>
              <!-- Terminal Content -->
              <div class="flex-1 overflow-hidden">
                {#if activeTerminal && terminalWs}
                  {#await import("$lib/components/terminal-view.svelte") then { default: TerminalView }}
                    <TerminalView
                      target={activeTerminal}
                      ws={terminalWs}
                      onClose={() => {
                        appPanelExpanded = false;
                      }}
                    />
                  {/await}
                {:else}
                  <div
                    class="h-full flex items-center justify-center text-zinc-500 text-sm"
                  >
                    Select a terminal from the sidebar
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </Resizable.Pane>
      {:else if !appPanelExpanded && terminalPanes.length > 0}
        <!-- Collapsed app panel toggle -->
        <button
          onclick={() => {
            appPanelExpanded = true;
          }}
          class="w-10 bg-muted/30 border-l border-border flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0 hidden md:flex"
          title="Show terminal panel"
        >
          <Terminal class="size-5" />
          <span class="text-[10px] writing-mode-vertical">Terminal</span>
        </button>
      {/if}
    </Resizable.PaneGroup>
  </Sidebar.Inset>
</Sidebar.Provider>

<style>
  .writing-mode-vertical {
    writing-mode: vertical-rl;
    text-orientation: mixed;
  }
</style>
