<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
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
    lastMessage?: string;
    updatedAt: Date;
  }

  let { children } = $props();
  let viber = $state<Viber | null>(null);
  let loading = $state(true);
  let sidebarCollapsed = $state(false);
  
  // Collapsible group states
  let chatsExpanded = $state(true);
  let appsExpanded = $state(true);

  // For now, we'll have a single default chat per viber
  let chatSessions = $state<ChatSession[]>([]);

  const viberId = $derived($page.params.id);
  const currentPath = $derived($page.url.pathname);

  // Determine active section from path
  const activeSection = $derived(() => {
    if (currentPath.includes("/terminals")) return "terminals";
    if (currentPath.includes("/ports")) return "ports";
    return "chat";
  });

  async function fetchViber() {
    try {
      const response = await fetch(`/api/vibers/${viberId}`);
      if (response.ok) {
        viber = await response.json();
        // Create default chat session if none exists
        if (chatSessions.length === 0) {
          chatSessions = [
            {
              id: "default",
              name: "Chat",
              updatedAt: new Date(),
            },
          ];
        }
      }
    } catch (error) {
      console.error("Failed to fetch viber:", error);
    } finally {
      loading = false;
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
        activeTab: activeSection(),
      });
    }
  });

  onMount(() => {
    fetchViber();
    const interval = setInterval(fetchViber, 5000);
    return () => {
      clearInterval(interval);
      headerStore.setViberContext(null);
    };
  });
</script>

<div class="flex-1 flex min-h-0 overflow-hidden">
  <!-- Sidebar -->
  <aside
    class="shrink-0 border-r border-border bg-muted/20 flex flex-col transition-all duration-200 {sidebarCollapsed
      ? 'w-12'
      : 'w-60'}"
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
        <div class="mb-3">
          <div class="flex items-center justify-between px-2 py-1.5">
            <button
              onclick={() => (chatsExpanded = !chatsExpanded)}
              class="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
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
                  class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors {activeSection() === 'chat'
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

        <!-- Apps Group -->
        <div>
          <button
            onclick={() => (appsExpanded = !appsExpanded)}
            class="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors rounded-md hover:bg-accent/50"
          >
            <span>Apps</span>
            {#if appsExpanded}
              <ChevronDown class="size-3.5" />
            {:else}
              <ChevronRight class="size-3.5" />
            {/if}
          </button>

          {#if appsExpanded}
            <div class="mt-1 space-y-0.5">
              <a
                href="/vibers/{viberId}/terminals"
                class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors {activeSection() === 'terminals'
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
              >
                <Terminal class="size-4 shrink-0" />
                <span class="truncate">Terminals</span>
              </a>

              <a
                href="/vibers/{viberId}/ports"
                class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors {activeSection() === 'ports'
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
              >
                <Server class="size-4 shrink-0" />
                <span class="truncate">Ports</span>
              </a>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Collapsed state - just icons -->
        <div class="space-y-1">
          <a
            href="/vibers/{viberId}"
            class="flex items-center justify-center p-2 rounded-md transition-colors {activeSection() === 'chat'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
            title="Chat"
          >
            <MessageSquare class="size-5" />
          </a>
          <a
            href="/vibers/{viberId}/terminals"
            class="flex items-center justify-center p-2 rounded-md transition-colors {activeSection() === 'terminals'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
            title="Terminals"
          >
            <Terminal class="size-5" />
          </a>
          <a
            href="/vibers/{viberId}/ports"
            class="flex items-center justify-center p-2 rounded-md transition-colors {activeSection() === 'ports'
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
