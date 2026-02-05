<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy } from "svelte";
  import { headerStore } from "$lib/stores/header";
  import {
    MessageSquare,
    Terminal,
    Server,
    ChevronDown,
    ChevronRight,
    Plus,
    Circle,
    PanelLeftClose,
    PanelLeft,
    ExternalLink,
  } from "@lucide/svelte";

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

  let { children } = $props();
  let viber = $state<Viber | null>(null);
  let loading = $state(true);
  let sidebarCollapsed = $state(false);
  
  // Collapsible group states
  let chatsExpanded = $state(true);
  let terminalsExpanded = $state(true);
  let portsExpanded = $state(true);

  // Data
  let chatSessions = $state<ChatSession[]>([]);
  let terminalPanes = $state<TmuxPane[]>([]);
  let ports = $state<PortTarget[]>([]);
  
  // Terminal WebSocket
  let terminalWs = $state<WebSocket | null>(null);

  const viberId = $derived($page.params.id);
  const currentPath = $derived($page.url.pathname);

  // Determine active item from path
  const getActiveItem = $derived(() => {
    const path = currentPath;
    if (path.includes("/terminals/")) {
      const match = path.match(/\/terminals\/(.+)/);
      return { type: "terminal", id: match?.[1] || "" };
    }
    if (path.includes("/terminals")) return { type: "terminals-index", id: "" };
    if (path.includes("/ports")) return { type: "ports", id: "" };
    return { type: "chat", id: "default" };
  });

  async function fetchViber() {
    try {
      const response = await fetch(`/api/vibers/${viberId}`);
      if (response.ok) {
        viber = await response.json();
        if (chatSessions.length === 0) {
          chatSessions = [{ id: "default", name: "Chat", updatedAt: new Date() }];
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

  // Sync viber context to header
  $effect(() => {
    if (viber?.id) {
      headerStore.setViberContext({
        viberId: viber.id,
        viberName: viber.name,
        isConnected: viber.isConnected,
        platform: viber.platform,
        skills: viber.skills ?? [],
        activeTab: getActiveItem().type,
      });
    }
  });

  onMount(() => {
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
</script>

<div class="flex-1 flex min-h-0 overflow-hidden">
  <!-- Sidebar -->
  <aside
    class="shrink-0 border-r border-border bg-muted/20 flex flex-col transition-all duration-200 {sidebarCollapsed
      ? 'w-12'
      : 'w-64'}"
  >
    <!-- Sidebar Header -->
    <div class="p-3 border-b border-border/50 flex items-center justify-between">
      {#if !sidebarCollapsed}
        <div class="flex items-center gap-2 min-w-0">
          {#if viber?.isConnected}
            <Circle class="size-2.5 fill-green-500 text-green-500 shrink-0" />
          {:else}
            <Circle class="size-2.5 fill-muted-foreground text-muted-foreground shrink-0" />
          {/if}
          <span class="font-medium text-sm truncate">{viber?.name || "Loading..."}</span>
        </div>
      {/if}
      <button
        onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
        class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {#if sidebarCollapsed}
          <PanelLeft class="size-4" />
        {:else}
          <PanelLeftClose class="size-4" />
        {/if}
      </button>
    </div>

    <!-- Navigation Groups -->
    <nav class="flex-1 overflow-y-auto p-2">
      {#if !sidebarCollapsed}
        <!-- Chats Group -->
        <div class="mb-4">
          <div class="flex items-center justify-between px-2 py-1.5">
            <button
              onclick={() => (chatsExpanded = !chatsExpanded)}
              class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              {#if chatsExpanded}
                <ChevronDown class="size-3.5" />
              {:else}
                <ChevronRight class="size-3.5" />
              {/if}
              <span>Chats</span>
            </button>
            <button
              onclick={() => { /* TODO: new chat */ }}
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="New chat"
            >
              <Plus class="size-3.5" />
            </button>
          </div>

          {#if chatsExpanded}
            <div class="mt-1 space-y-0.5">
              {#each chatSessions as chat (chat.id)}
                <a
                  href="/vibers/{viberId}"
                  class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors {getActiveItem().type === 'chat'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
                >
                  <MessageSquare class="size-4 shrink-0" />
                  <span class="truncate">{chat.name}</span>
                </a>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Terminals Group -->
        <div class="mb-4">
          <div class="flex items-center justify-between px-2 py-1.5">
            <button
              onclick={() => (terminalsExpanded = !terminalsExpanded)}
              class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              {#if terminalsExpanded}
                <ChevronDown class="size-3.5" />
              {:else}
                <ChevronRight class="size-3.5" />
              {/if}
              <span>Terminals</span>
              {#if terminalPanes.length > 0}
                <span class="text-[10px] bg-muted px-1.5 py-0.5 rounded-full font-normal normal-case">
                  {terminalPanes.length}
                </span>
              {/if}
            </button>
          </div>

          {#if terminalsExpanded}
            <div class="mt-1 space-y-0.5">
              {#if terminalPanes.length === 0}
                <div class="px-3 py-2 text-xs text-muted-foreground">
                  No terminals
                </div>
              {:else}
                {#each Array.from(terminalsBySession().entries()) as [sessionName, panes]}
                  <div class="mb-2">
                    <div class="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase">
                      {sessionName}
                    </div>
                    {#each panes as pane}
                      <a
                        href="/vibers/{viberId}/terminals?target={encodeURIComponent(pane.target)}"
                        class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors {getActiveItem().type === 'terminal' && getActiveItem().id === pane.target
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
                      >
                        <Terminal class="size-4 shrink-0" />
                        <span class="truncate font-mono text-xs">{pane.windowName}:{pane.pane}</span>
                      </a>
                    {/each}
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Ports Group -->
        <div class="mb-4">
          <div class="flex items-center justify-between px-2 py-1.5">
            <button
              onclick={() => (portsExpanded = !portsExpanded)}
              class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              {#if portsExpanded}
                <ChevronDown class="size-3.5" />
              {:else}
                <ChevronRight class="size-3.5" />
              {/if}
              <span>Ports</span>
            </button>
            <a
              href="/vibers/{viberId}/ports"
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Manage ports"
            >
              <Plus class="size-3.5" />
            </a>
          </div>

          {#if portsExpanded}
            <div class="mt-1 space-y-0.5">
              {#each ports as port (port.id)}
                <button
                  onclick={() => window.open(`http://localhost:${port.port}`, '_blank')}
                  class="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50"
                >
                  <Server class="size-4 shrink-0" />
                  <span class="truncate">{port.name}</span>
                  <span class="ml-auto text-xs opacity-70">:{port.port}</span>
                  <ExternalLink class="size-3 opacity-50" />
                </button>
              {/each}
            </div>
          {/if}
        </div>

      {:else}
        <!-- Collapsed state - just icons -->
        <div class="space-y-1">
          <a
            href="/vibers/{viberId}"
            class="flex items-center justify-center p-2.5 rounded-md transition-colors {getActiveItem().type === 'chat'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
            title="Chat"
          >
            <MessageSquare class="size-5" />
          </a>
          <a
            href="/vibers/{viberId}/terminals"
            class="flex items-center justify-center p-2.5 rounded-md transition-colors {getActiveItem().type === 'terminals-index' || getActiveItem().type === 'terminal'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
            title="Terminals ({terminalPanes.length})"
          >
            <Terminal class="size-5" />
          </a>
          <a
            href="/vibers/{viberId}/ports"
            class="flex items-center justify-center p-2.5 rounded-md transition-colors {getActiveItem().type === 'ports'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
            title="Ports"
          >
            <Server class="size-5" />
          </a>
        </div>
      {/if}
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 min-w-0 flex flex-col overflow-hidden">
    {@render children()}
  </main>
</div>
