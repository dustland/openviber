<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import {
    RefreshCw,
    Circle,
    SendHorizontal,
    Cpu,
    Server,
    Plus,
    Copy,
    Check,
    Trash2,
    Clock,
    Pencil,
    X,
    AlertTriangle,
    MoreHorizontal,
    Eye,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import ViberAvatar from "$lib/components/icons/ViberAvatar.svelte";

  interface Viber {
    id: string;
    name: string;
    platform: string | null;
    version: string | null;
    capabilities: string[] | null;
    isConnected: boolean;
    connectedAt: string | null;
    runningTasks: number;
  }

  interface ViberNode {
    id: string;
    name: string;
    status: "pending" | "active" | "offline";
    onboard_token: string | null;
    token_expires_at: string | null;
    config: Record<string, unknown>;
    created_at: string;
  }

  let vibers = $state<Viber[]>([]);
  let nodes = $state<ViberNode[]>([]);
  let loading = $state(true);
  let hubConnected = $state(false);
  let viberConfigErrors = $state<Record<string, string>>({});

  // Create node dialog state
  let showCreateDialog = $state(false);
  let newNodeName = $state("My Viber");
  let creating = $state(false);
  let createdNode = $state<ViberNode | null>(null);
  let copied = $state(false);

  // Node detail/edit dialog
  let selectedNode = $state<ViberNode | null>(null);
  let editingNodeName = $state(false);
  let editNodeNameValue = $state("");
  let savingNodeName = $state(false);

  // Context menu state
  let contextMenuNode = $state<ViberNode | null>(null);
  let contextMenuPos = $state({ x: 0, y: 0 });

  async function fetchVibers() {
    try {
      const hubResponse = await fetch("/api/hub");
      const hubStatus = await hubResponse.json();
      hubConnected = hubStatus.connected;

      if (hubConnected) {
        const response = await fetch("/api/vibers");
        const data = await response.json();
        vibers = Array.isArray(data) ? data : [];
      } else {
        vibers = [];
      }
    } catch (error) {
      console.error("Failed to fetch vibers:", error);
      hubConnected = false;
      vibers = [];
    }
  }

  async function checkViberConfigs(viberList: Viber[]) {
    const errors: Record<string, string> = {};
    await Promise.all(
      viberList.map(async (v) => {
        try {
          const res = await fetch(`/api/vibers/${v.id}/config`);
          const data = await res.json();
          if (data.error) {
            errors[v.id] = data.error;
          }
        } catch {
          // Ignore fetch errors for config check
        }
      }),
    );
    viberConfigErrors = errors;
  }

  async function fetchNodes() {
    try {
      const response = await fetch("/api/nodes");
      const data = await response.json();
      nodes = Array.isArray(data.nodes) ? data.nodes : [];
    } catch (error) {
      console.error("Failed to fetch nodes:", error);
      nodes = [];
    }
  }

  async function createNode() {
    creating = true;
    try {
      const response = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newNodeName.trim() || "My Viber" }),
      });
      const data = await response.json();
      if (data.node) {
        createdNode = data.node;
        await fetchNodes();
      }
    } catch (error) {
      console.error("Failed to create node:", error);
    } finally {
      creating = false;
    }
  }

  async function deleteNode(nodeId: string) {
    try {
      await fetch("/api/nodes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: nodeId }),
      });
      selectedNode = null;
      contextMenuNode = null;
      await fetchNodes();
    } catch (error) {
      console.error("Failed to delete node:", error);
    }
  }

  async function updateNodeName(nodeId: string, name: string) {
    savingNodeName = true;
    try {
      const res = await fetch(`/api/nodes/${nodeId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        if (selectedNode) selectedNode.name = name;
        editingNodeName = false;
        await fetchNodes();
      }
    } catch (error) {
      console.error("Failed to update node name:", error);
    } finally {
      savingNodeName = false;
    }
  }

  function openNodeDetail(node: ViberNode) {
    selectedNode = node;
    editingNodeName = false;
    editNodeNameValue = node.name;
    copied = false;
  }

  function getOnboardCommand(token: string): string {
    return `npx openviber onboard --token ${token}`;
  }

  async function copyCommand(token: string) {
    try {
      await navigator.clipboard.writeText(getOnboardCommand(token));
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // fallback
    }
  }

  function formatPlatform(platform: string | null): string {
    switch (platform) {
      case "darwin":
        return "macOS";
      case "linux":
        return "Linux";
      case "win32":
        return "Windows";
      default:
        return platform || "Unknown";
    }
  }

  function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function closeCreateDialog() {
    showCreateDialog = false;
    createdNode = null;
    newNodeName = "My Viber";
    copied = false;
  }

  function openContextMenu(e: MouseEvent, node: ViberNode) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuNode = node;
    contextMenuPos = { x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    contextMenuNode = null;
  }

  function nodeStatusLabel(node: ViberNode): string {
    switch (node.status) {
      case "active":
        return "Active";
      case "pending":
        return "Pending";
      default:
        return "Offline";
    }
  }

  function nodeStatusColor(node: ViberNode): string {
    switch (node.status) {
      case "active":
        return "bg-green-500";
      case "pending":
        return "bg-amber-500";
      default:
        return "bg-gray-400";
    }
  }

  function nodeStatusBadgeClasses(node: ViberNode): string {
    switch (node.status) {
      case "active":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "pending":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  }

  onMount(() => {
    loading = true;
    Promise.all([fetchVibers(), fetchNodes()])
      .then(() => checkViberConfigs(vibers))
      .finally(() => (loading = false));

    const interval = setInterval(() => {
      fetchVibers().then(() => checkViberConfigs(vibers));
      fetchNodes();
    }, 10000);

    function handleClick() {
      contextMenuNode = null;
    }
    document.addEventListener("click", handleClick);

    return () => {
      clearInterval(interval);
      document.removeEventListener("click", handleClick);
    };
  });
</script>

<svelte:head>
  <title>Vibers - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold text-foreground">Vibers</h1>
      <p class="text-sm mt-0.5 text-muted-foreground flex items-center gap-2">
        {#if hubConnected}
          <span class="flex items-center gap-1">
            <Circle class="size-2 fill-green-500 text-green-500" />
            Hub connected
          </span>
          · {vibers.length} viber{vibers.length !== 1 ? "s" : ""} online · {nodes.length}
          node{nodes.length !== 1 ? "s" : ""} registered
        {:else}
          <span class="flex items-center gap-1">
            <Circle class="size-2 fill-red-500 text-red-500" />
            Hub disconnected
          </span>
          · {nodes.length} node{nodes.length !== 1 ? "s" : ""} registered
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        onclick={() => (showCreateDialog = true)}
      >
        <Plus class="size-4 mr-1" />
        Add Node
      </Button>
      <Button
        variant="outline"
        size="icon"
        onclick={() => {
          fetchVibers().then(() => checkViberConfigs(vibers));
          fetchNodes();
        }}
      >
        <RefreshCw class="size-4" />
      </Button>
    </div>
  </div>

  <!-- Loading -->
  {#if loading}
    <div class="text-center py-12 text-muted-foreground">Loading...</div>
  {:else}
    <!-- Registered Nodes -->
    {#if nodes.length > 0}
      <div class="mb-8">
        <h2
          class="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3"
        >
          Registered Nodes
        </h2>
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {#each nodes as node (node.id)}
            <button
              type="button"
              class="w-full text-left"
              onclick={() => openNodeDetail(node)}
            >
              <Card
                class="relative group hover:shadow-md transition-shadow cursor-pointer"
              >
                <CardHeader class="pb-3">
                  <div class="flex items-start gap-3">
                    <div
                      class="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0"
                    >
                      <Server class="size-5 text-muted-foreground" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <CardTitle class="flex items-center gap-2 text-base">
                        <span class="truncate">{node.name}</span>
                        <span
                          class="w-1.5 h-1.5 rounded-full shrink-0 {nodeStatusColor(
                            node,
                          )}"
                        ></span>
                      </CardTitle>
                      <CardDescription class="text-xs mt-0.5">
                        {nodeStatusLabel(node)}
                        · created {formatTimeAgo(node.created_at)}
                      </CardDescription>
                    </div>
                    <!-- Ellipsis context menu trigger -->
                    <button
                      type="button"
                      class="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      onclick={(e) => openContextMenu(e, node)}
                    >
                      <MoreHorizontal class="size-4" />
                    </button>
                  </div>
                </CardHeader>
                {#if node.status === "pending" && node.onboard_token}
                  <CardContent class="pt-0 pb-3">
                    <Badge
                      variant="outline"
                      class="text-[11px] px-1.5 py-0 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    >
                      Waiting for onboarding
                    </Badge>
                  </CardContent>
                {/if}
              </Card>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Connected Vibers (live from hub) -->
    {#if vibers.length > 0}
      <div>
        <h2
          class="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3"
        >
          Connected Vibers
        </h2>
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {#each vibers as viber (viber.id)}
            {@const hasConfigError = !!viberConfigErrors[viber.id]}
            <a href="/vibers/{viber.id}" class="block">
              <Card
                class="hover:shadow-md transition-shadow cursor-pointer {hasConfigError
                  ? 'border-amber-500/40'
                  : ''}"
              >
                <CardHeader class="pb-3">
                  <div class="flex items-start gap-3">
                    <div
                      class="size-10 rounded-lg flex items-center justify-center shrink-0 {hasConfigError
                        ? 'bg-amber-500/10'
                        : 'bg-primary/10'}"
                    >
                      {#if hasConfigError}
                        <AlertTriangle class="size-5 text-amber-500" />
                      {:else}
                        <ViberAvatar class="size-6 text-primary" />
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <CardTitle class="flex items-center gap-2 text-base">
                        <span class="truncate">{viber.name}</span>
                        {#if hasConfigError}
                          <span
                            class="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-500"
                          ></span>
                        {:else}
                          <span
                            class="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500"
                          ></span>
                        {/if}
                      </CardTitle>
                      <CardDescription class="text-xs mt-0.5">
                        {#if hasConfigError}
                          <span class="text-amber-600 dark:text-amber-400"
                            >Needs setup</span
                          > ·
                        {/if}
                        {formatPlatform(viber.platform)}{#if viber.version}
                          · v{viber.version}{/if}
                        {#if viber.connectedAt}
                          · connected {formatTimeAgo(viber.connectedAt)}
                        {/if}
                      </CardDescription>
                    </div>
                    <SendHorizontal
                      class="size-4 text-muted-foreground/50 shrink-0 mt-1"
                    />
                  </div>
                </CardHeader>
                {#if (viber.capabilities && viber.capabilities.length > 0) || viber.runningTasks > 0}
                  <CardContent class="pt-0 pb-3">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      {#if viber.capabilities}
                        {#each viber.capabilities as cap}
                          <Badge
                            variant="outline"
                            class="text-[11px] px-1.5 py-0">{cap}</Badge
                          >
                        {/each}
                      {/if}
                      {#if viber.runningTasks > 0}
                        <Badge
                          variant="default"
                          class="text-[11px] bg-blue-500/20 text-blue-700 dark:text-blue-400 border-0 px-1.5 py-0"
                        >
                          {viber.runningTasks} task{viber.runningTasks > 1
                            ? "s"
                            : ""}
                        </Badge>
                      {/if}
                    </div>
                  </CardContent>
                {/if}
              </Card>
            </a>
          {/each}
        </div>
      </div>
    {:else if !hubConnected}
      <Card class="text-center py-12">
        <CardContent>
          <div class="mb-4 text-muted-foreground">
            <Server class="size-12 mx-auto mb-4 opacity-50" />
            <p class="text-lg font-medium">Hub Not Connected</p>
            <p class="text-sm mt-2 max-w-md mx-auto">
              The viber hub server is not running. Start it with:
            </p>
          </div>
          <div class="mt-6 p-4 bg-muted rounded-lg text-left max-w-md mx-auto">
            <p class="text-sm font-mono text-muted-foreground">
              # Start everything together<br />
              pnpm dev
            </p>
          </div>
        </CardContent>
      </Card>
    {:else if nodes.length === 0}
      <Card class="text-center py-12">
        <CardContent>
          <div class="mb-4 text-muted-foreground">
            <Cpu class="size-12 mx-auto mb-4 opacity-50" />
            <p class="text-lg font-medium">No Vibers Yet</p>
            <p class="text-sm mt-2 max-w-md mx-auto">
              Create a node to get started. Click "Add Node" above and follow
              the onboarding instructions.
            </p>
          </div>
        </CardContent>
      </Card>
    {:else}
      <div>
        <h2
          class="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3"
        >
          Connected Vibers
        </h2>
        <Card class="text-center py-8">
          <CardContent>
            <p class="text-sm text-muted-foreground">
              No vibers are currently connected to the hub. Start a viber daemon
              on one of your registered nodes.
            </p>
          </CardContent>
        </Card>
      </div>
    {/if}
  {/if}
</div>

<!-- Create Node Dialog -->
{#if showCreateDialog}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeCreateDialog();
    }}
    onkeydown={(e) => {
      if (e.key === "Escape") closeCreateDialog();
    }}
  >
    <div
      class="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6"
    >
      {#if createdNode}
        <!-- Success state: show onboard command -->
        <div class="space-y-4">
          <div>
            <h2 class="text-lg font-semibold text-foreground">Node Created</h2>
            <p class="text-sm text-muted-foreground mt-1">
              Run this command on the target machine to connect it:
            </p>
          </div>

          <div class="relative">
            <div
              class="bg-muted rounded-lg p-4 pr-12 font-mono text-sm text-foreground break-all select-all"
            >
              {getOnboardCommand(createdNode.onboard_token ?? "")}
            </div>
            <button
              type="button"
              class="absolute top-3 right-3 p-1.5 rounded-md hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
              onclick={() => copyCommand(createdNode?.onboard_token ?? "")}
            >
              {#if copied}
                <Check class="size-4 text-green-500" />
              {:else}
                <Copy class="size-4" />
              {/if}
            </button>
          </div>

          <div
            class="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
          >
            <Clock class="size-3.5 shrink-0" />
            This token expires in 15 minutes. Generate a new one if it expires.
          </div>

          <div class="flex justify-end">
            <Button variant="outline" onclick={closeCreateDialog}>Done</Button>
          </div>
        </div>
      {:else}
        <!-- Input state: enter name -->
        <div class="space-y-4">
          <div>
            <h2 class="text-lg font-semibold text-foreground">Add a Node</h2>
            <p class="text-sm text-muted-foreground mt-1">
              A node is a machine where your vibers run. Name it, then you'll
              get a command to connect it.
            </p>
          </div>

          <div>
            <label
              for="node-name"
              class="block text-sm font-medium text-foreground mb-1.5"
            >
              Node name
            </label>
            <input
              id="node-name"
              type="text"
              bind:value={newNodeName}
              placeholder="My Viber"
              class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              onkeydown={(e) => {
                if (e.key === "Enter") createNode();
              }}
            />
          </div>

          <div class="flex justify-end gap-2">
            <Button variant="outline" onclick={closeCreateDialog}>Cancel</Button
            >
            <Button onclick={createNode} disabled={creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Node Context Menu -->
{#if contextMenuNode}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed z-50 min-w-[160px] bg-background border border-border rounded-lg shadow-xl py-1 text-sm"
    style="left: {contextMenuPos.x}px; top: {contextMenuPos.y}px;"
    onkeydown={(e) => {
      if (e.key === "Escape") closeContextMenu();
    }}
  >
    <button
      type="button"
      class="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-foreground"
      onclick={() => {
        const node = contextMenuNode;
        closeContextMenu();
        if (node) openNodeDetail(node);
      }}
    >
      <Pencil class="size-3.5" />
      Edit Node
    </button>
    <div class="border-t border-border my-1"></div>
    <button
      type="button"
      class="w-full text-left px-3 py-1.5 hover:bg-destructive/10 flex items-center gap-2 text-destructive"
      onclick={() => {
        const nodeId = contextMenuNode?.id;
        closeContextMenu();
        if (nodeId) deleteNode(nodeId);
      }}
    >
      <Trash2 class="size-3.5" />
      Delete Node
    </button>
  </div>
{/if}

<!-- Node Detail / Edit Dialog -->
{#if selectedNode}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) selectedNode = null;
    }}
    onkeydown={(e) => {
      if (e.key === "Escape") selectedNode = null;
    }}
  >
    <div
      class="bg-background rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-border"
    >
      <!-- Header -->
      <div class="flex items-start gap-3 p-5 pb-0">
        <div
          class="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0"
        >
          <Server class="size-5 text-muted-foreground" />
        </div>
        <div class="min-w-0 flex-1">
          {#if editingNodeName}
            <form
              class="flex items-center gap-2"
              onsubmit={(e) => {
                e.preventDefault();
                updateNodeName(selectedNode!.id, editNodeNameValue);
              }}
            >
              <input
                type="text"
                bind:value={editNodeNameValue}
                class="text-lg font-semibold bg-transparent border-b border-primary/50 outline-none flex-1 min-w-0 py-0.5"
              />
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                disabled={savingNodeName}
                class="h-7 px-2"
              >
                <Check class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onclick={() => (editingNodeName = false)}
                class="h-7 px-2"
              >
                <X class="size-3.5" />
              </Button>
            </form>
          {:else}
            <button
              type="button"
              class="flex items-center gap-2 group"
              onclick={() => {
                editingNodeName = true;
                editNodeNameValue = selectedNode!.name;
              }}
            >
              <h2 class="text-lg font-semibold">{selectedNode.name}</h2>
              <Pencil
                class="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </button>
          {/if}
          <div class="flex items-center gap-2 mt-1">
            <span
              class="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full {nodeStatusBadgeClasses(
                selectedNode,
              )}"
            >
              <span
                class="w-1.5 h-1.5 rounded-full {nodeStatusColor(selectedNode)}"
              ></span>
              {nodeStatusLabel(selectedNode)}
            </span>
            <span class="text-xs text-muted-foreground">
              Created {formatTimeAgo(selectedNode.created_at)}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => (selectedNode = null)}
        >
          <X class="size-4" />
        </button>
      </div>

      <div class="p-5 space-y-4">
        <!-- Onboard command for pending nodes -->
        {#if selectedNode.onboard_token}
          <div>
            <h3
              class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2"
            >
              Setup Command
            </h3>
            <div class="p-3 bg-muted rounded-lg">
              <div class="flex items-center gap-2">
                <code
                  class="text-sm font-mono text-foreground break-all flex-1"
                >
                  {getOnboardCommand(selectedNode.onboard_token)}
                </code>
                <button
                  type="button"
                  class="shrink-0 p-1.5 rounded-md hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
                  onclick={() => copyCommand(selectedNode!.onboard_token ?? "")}
                >
                  {#if copied}
                    <Check class="size-4 text-green-500" />
                  {:else}
                    <Copy class="size-4" />
                  {/if}
                </button>
              </div>
              <div
                class="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400"
              >
                <Clock class="size-3 shrink-0" />
                Expires in 15 minutes
              </div>
            </div>
          </div>
        {/if}

        <!-- Node ID -->
        <div>
          <h3
            class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1"
          >
            Node ID
          </h3>
          <p class="text-xs font-mono text-muted-foreground select-all">
            {selectedNode.id}
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30"
      >
        <Button
          variant="ghost"
          size="sm"
          class="text-destructive hover:text-destructive hover:bg-destructive/10"
          onclick={() => deleteNode(selectedNode!.id)}
        >
          <Trash2 class="size-3.5 mr-1.5" />
          Delete Node
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={() => (selectedNode = null)}
        >
          Close
        </Button>
      </div>
    </div>
  </div>
{/if}
