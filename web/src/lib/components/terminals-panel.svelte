<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import TerminalView from "./terminal-view.svelte";
  import { Button } from "$lib/components/ui/button";
  import { RefreshCw, Plus, X, Terminal } from "@lucide/svelte";

  interface TmuxPane {
    session: string;
    window: string;
    windowName: string;
    pane: string;
    command: string;
    target: string;
  }

  interface TmuxSession {
    name: string;
    windows: number;
    attached: boolean;
  }

  let sessions = $state<TmuxSession[]>([]);
  let panes = $state<TmuxPane[]>([]);
  let ws = $state<WebSocket | null>(null);
  let connected = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let creatingSession = $state(false);

  /** Which panes are open in the UI */
  let openPanes = $state<Set<string>>(new Set());

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
        sessionName: "coding",
        windowName: "main",
      })
    );
  }

  function togglePane(target: string) {
    const newSet = new Set(openPanes);
    if (newSet.has(target)) {
      newSet.delete(target);
    } else {
      newSet.add(target);
    }
    openPanes = newSet;
  }

  function closePane(target: string) {
    const newSet = new Set(openPanes);
    newSet.delete(target);
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
    const map = new Map<string, TmuxPane[]>();
    for (const pane of panes) {
      const list = map.get(pane.session) || [];
      list.push(pane);
      map.set(pane.session, list);
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
        Create and manage terminal sessions directly from Viber Board.
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
          {#each Array.from(panesBySession().entries()) as [sessionName, sessionPanes]}
            {#each sessionPanes as pane}
              <button
                class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap {openPanes.has(pane.target)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'}"
                onclick={() => togglePane(pane.target)}
              >
                <Terminal class="size-3.5" />
                <span>{sessionName}:{pane.windowName}</span>
                {#if openPanes.has(pane.target)}
                  <button
                    class="ml-1 p-0.5 rounded hover:bg-primary-foreground/20"
                    onclick={(e) => { e.stopPropagation(); closePane(pane.target); }}
                  >
                    <X class="size-3" />
                  </button>
                {/if}
              </button>
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
      {#if openPanes.size === 0}
        <div class="h-full flex items-center justify-center text-muted-foreground text-sm">
          Click a terminal tab above to open it
        </div>
      {:else}
        <div
          class="h-full grid gap-1 p-1"
          style="grid-template-columns: repeat({Math.min(openPanes.size, 2)}, 1fr);"
        >
          {#each Array.from(openPanes) as target (target)}
            <div class="min-h-0 overflow-hidden rounded border border-border">
              <TerminalView
                {target}
                {ws}
                onClose={() => closePane(target)}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
