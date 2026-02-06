<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import TerminalView from "./terminal-view.svelte";
  import { Button } from "$lib/components/ui/button";
  import { RefreshCw, X, Terminal } from "@lucide/svelte";

  interface TerminalPane {
    appId: string;
    session: string;
    window: string;
    windowName: string;
    pane: string;
    command: string;
    target: string;
  }

  interface TerminalSession {
    appId: string;
    name: string;
    windows: number;
    attached: boolean;
  }

  interface TerminalAppMeta {
    id: string;
    label: string;
    available: boolean;
  }

  let apps = $state<TerminalAppMeta[]>([]);
  let sessions = $state<TerminalSession[]>([]);
  let panes = $state<TerminalPane[]>([]);
  let ws = $state<WebSocket | null>(null);
  let connected = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let creatingSession = $state(false);

  /** Which panes are open in the UI (appId::target) */
  let openPanes = $state<Set<string>>(new Set());

  function paneKey(appId: string, target: string): string {
    return `${appId}::${target}`;
  }

  // WebSocket URL - computed in browser only
  let wsUrl = "";

  function connect() {
    if (typeof window === "undefined") return;
    wsUrl = `ws://${window.location.hostname}:6008`;

    error = null;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connected = true;
      loading = false;
      requestList();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        // Ignore non-JSON
      }
    };

    ws.onerror = () => {
      error = "WebSocket error";
    };

    ws.onclose = () => {
      connected = false;
      ws = null;
    };
  }

  function handleMessage(msg: any) {
    switch (msg.type) {
      case "terminal:list":
        apps = msg.apps || [];
        sessions = msg.sessions || [];
        panes = msg.panes || [];
        break;
      case "terminal:session-created":
        creatingSession = false;
        if (!msg.ok) {
          error = msg.error || "Failed to create tmux session";
        } else {
          error = null;
        }
        break;
    }
  }

  function requestList() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "terminal:list" }));
    }
  }

  function createSession() {
    if (!ws || ws.readyState !== WebSocket.OPEN || creatingSession) return;
    creatingSession = true;
    error = null;
    ws.send(
      JSON.stringify({
        type: "terminal:create-session",
        appId: "tmux",
        sessionName: "coding",
        windowName: "main",
      })
    );
  }

  function togglePane(appId: string, target: string) {
    const key = paneKey(appId, target);
    const newSet = new Set(openPanes);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    openPanes = newSet;
  }

  function closePane(appId: string, target: string) {
    const newSet = new Set(openPanes);
    newSet.delete(paneKey(appId, target));
    openPanes = newSet;
  }

  onMount(() => {
    connect();
  });

  onDestroy(() => {
    ws?.close();
  });

  // Group panes by session
  const panesBySession = $derived(() => {
    const map = new Map<string, TerminalPane[]>();
    for (const pane of panes) {
      const key = `${pane.appId}:${pane.session}`;
      const list = map.get(key) || [];
      list.push(pane);
      map.set(key, list);
    }
    return map;
  });
</script>

<svelte:head>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/@xterm/xterm@6.0.0/css/xterm.min.css"
  />
</svelte:head>

<div class="flex flex-col h-full bg-background">
  {#if loading}
    <div class="flex-1 flex items-center justify-center text-muted-foreground">
      Connecting to viber terminals...
    </div>
  {:else if error}
    <div class="flex-1 flex flex-col items-center justify-center gap-3 text-destructive">
      {error}
      <Button variant="outline" size="sm" onclick={connect}>Retry</Button>
    </div>
  {:else if panes.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Terminal class="size-12 opacity-50" />
      <p>No tmux sessions found.</p>
      <p class="text-sm opacity-70">
        tmux is the primary terminal app, with room to expand to other runtimes.
      </p>
      <Button
        variant="outline"
        size="sm"
        onclick={createSession}
        disabled={creatingSession || !connected}
      >
        {creatingSession ? "Creating..." : "Create Coding Session"}
      </Button>
    </div>
  {:else}
    <!-- Top bar with session/pane tabs -->
    <div class="border-b border-border bg-muted/30 px-2 py-1.5">
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1 flex-1 overflow-x-auto">
          {#each Array.from(panesBySession().entries()) as [_sessionKey, sessionPanes]}
            {#each sessionPanes as pane}
              <div
                class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer {openPanes.has(paneKey(pane.appId, pane.target))
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'}"
                onclick={() => togglePane(pane.appId, pane.target)}
                onkeydown={(e) => e.key === 'Enter' && togglePane(pane.appId, pane.target)}
                role="button"
                tabindex="0"
              >
                <Terminal class="size-3.5" />
                <span>{pane.appId}:{pane.session}:{pane.windowName}</span>
                {#if openPanes.has(paneKey(pane.appId, pane.target))}
                  <button
                    class="ml-1 p-0.5 rounded hover:bg-primary-foreground/20"
                    onclick={(e) => { e.stopPropagation(); closePane(pane.appId, pane.target); }}
                  >
                    <X class="size-3" />
                  </button>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
        <Button variant="ghost" size="icon" class="size-7 shrink-0" onclick={requestList} title="Refresh">
          <RefreshCw class="size-3.5" />
        </Button>
      </div>
    </div>

    <!-- Terminal views -->
    <div class="flex-1 min-h-0 overflow-hidden">
      {#if apps.length > 0}
        <div class="px-3 py-2 text-xs text-muted-foreground border-b border-border/50">
          Available apps: {apps.filter((a) => a.available).map((a) => a.id).join(", ")}
        </div>
      {/if}
      {#if openPanes.size === 0}
        <div class="h-full flex items-center justify-center text-muted-foreground text-sm">
          Click a terminal tab above to open it
        </div>
      {:else}
        <div
          class="h-full grid gap-1 p-1"
          style="grid-template-columns: repeat({Math.min(openPanes.size, 2)}, 1fr);"
        >
          {#each Array.from(openPanes) as paneId (paneId)}
            {@const [appId, target] = paneId.split("::")}
            {@const pane = panes.find((p) => p.appId === appId && p.target === target)}
            <div class="min-h-0 overflow-hidden rounded border border-border">
              <TerminalView
                appId={appId || pane?.appId || "tmux"}
                {target}
                {ws}
                onClose={() => closePane(appId || "tmux", target)}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
