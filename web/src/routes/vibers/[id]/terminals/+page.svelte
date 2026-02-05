<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy } from "svelte";
  import TerminalView from "$lib/components/terminal-view.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Terminal, Plus } from "@lucide/svelte";

  interface TmuxPane {
    session: string;
    window: string;
    windowName: string;
    pane: string;
    command: string;
    target: string;
  }

  let panes = $state<TmuxPane[]>([]);
  let ws = $state<WebSocket | null>(null);
  let connected = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let creatingSession = $state(false);

  // Get target from URL query param
  const targetParam = $derived($page.url.searchParams.get("target"));
  
  // Track which terminal is currently open
  let openTarget = $state<string | null>(null);

  // Sync openTarget with URL param
  $effect(() => {
    if (targetParam) {
      openTarget = targetParam;
    }
  });

  function connect() {
    if (typeof window === "undefined") return;
    const wsUrl = `ws://${window.location.hostname}:6008`;

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
        if (msg.type === "terminal:list") {
          panes = msg.panes || [];
          // Auto-open first terminal if none selected
          if (!openTarget && panes.length > 0) {
            openTarget = panes[0].target;
          }
        } else if (msg.type === "terminal:session-created") {
          creatingSession = false;
          if (!msg.ok) {
            error = msg.error || "Failed to create session";
          }
        }
      } catch {}
    };

    ws.onerror = () => {
      error = "Connection failed";
    };

    ws.onclose = () => {
      connected = false;
      ws = null;
    };
  }

  function requestList() {
    ws?.send(JSON.stringify({ type: "terminal:list" }));
  }

  function createSession() {
    if (!ws || creatingSession) return;
    creatingSession = true;
    ws.send(JSON.stringify({
      type: "terminal:create-session",
      sessionName: "coding",
      windowName: "main",
    }));
  }

  onMount(() => {
    connect();
  });

  onDestroy(() => {
    ws?.close();
  });
</script>

<svelte:head>
  <title>Terminals - Viber Board</title>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/@xterm/xterm@6.0.0/css/xterm.min.css"
  />
</svelte:head>

<div class="flex flex-col h-full">
  {#if loading}
    <div class="flex-1 flex items-center justify-center text-muted-foreground">
      Connecting to terminals...
    </div>
  {:else if error}
    <div class="flex-1 flex flex-col items-center justify-center gap-3 text-destructive">
      <p>{error}</p>
      <Button variant="outline" size="sm" onclick={connect}>Retry</Button>
    </div>
  {:else if panes.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
      <Terminal class="size-16 opacity-30" />
      <div class="text-center">
        <p class="font-medium text-foreground">No terminal sessions</p>
        <p class="text-sm mt-1">Create a tmux session to get started</p>
      </div>
      <Button
        variant="outline"
        onclick={createSession}
        disabled={creatingSession}
      >
        <Plus class="size-4 mr-2" />
        {creatingSession ? "Creating..." : "Create Session"}
      </Button>
    </div>
  {:else if openTarget}
    <div class="flex-1 min-h-0 p-2">
      <div class="h-full rounded-lg border border-border overflow-hidden">
        <TerminalView
          target={openTarget}
          {ws}
          onClose={() => { openTarget = null; }}
        />
      </div>
    </div>
  {:else}
    <div class="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      Select a terminal from the sidebar
    </div>
  {/if}
</div>
